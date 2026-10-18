import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supplierAccountAccess } from "@/lib/supplier-portal/access";
import { canSubmitProfile } from "@/lib/supplier-portal/onboarding";
import { parseSupplierProfile } from "@/lib/supplier-portal/profile-input";
import { categoryProposalOptions, parseSupplierCategoryProposals } from "@/lib/supplier-portal/category-proposals";
import { prepareInitialDocuments, saveInitialEvidence } from "@/lib/supplier-portal/profile-evidence";
import { notifySupplierRegistration } from "@/lib/supplier-portal/notify";
import { ensureSupplierProfileEnglish } from "@/lib/ai/supplier-translation-service";
import type { SupplierInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/** The first business form creates the supplier page; neither this form nor account creation opens portal/publication access. */
export async function POST(request: Request) {
  const account = await supplierAccountAccess();
  if (!account) return fail("Cần đăng nhập bằng tài khoản nhà cung cấp.", 403);
  const { user, store } = account;
  if (store.mode !== "supabase") return fail("Chỉ có thể nộp hồ sơ khi kết nối Supabase.", 503);
  if (Number(request.headers.get("content-length") ?? 0) > 78 * 1024 * 1024) return fail("Tệp quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }
  if (String(form.get("website_hp") ?? "")) return fail("Không thể gửi yêu cầu này.");
  let parsed: ReturnType<typeof parseSupplierProfile>;
  let documents: Awaited<ReturnType<typeof prepareInitialDocuments>>;
  try { parsed = parseSupplierProfile(form); documents = await prepareInitialDocuments(form); }
  catch (error) { return fail(error instanceof Error ? error.message : "Hồ sơ không hợp lệ."); }
  let choices: ReturnType<typeof categoryProposalOptions>;
  try { choices = categoryProposalOptions(await store.listCategories({ publishedOnly: true })); }
  catch { return fail("Không đọc được danh mục Vexim. Vui lòng thử lại sau.", 503); }
  let proposals: ReturnType<typeof parseSupplierCategoryProposals>;
  try { proposals = parseSupplierCategoryProposals(form, choices); }
  catch (error) { return fail(error instanceof Error ? error.message : "Danh mục không hợp lệ."); }

  // Account can exist without a company. Re-read the DB link on every request, never trust submitted owner/status.
  const freshUser = await store.getUser(user.id);
  if (!freshUser || freshUser.role !== "supplier" || !freshUser.is_active ||
      freshUser.email.toLowerCase() !== user.email.toLowerCase()) return fail("Tài khoản đã thay đổi. Đăng nhập lại.", 403);
  let supplier = freshUser.supplier_id ? await store.getSupplier(freshUser.supplier_id) : null;
  if (freshUser.supplier_id && !supplier) return fail("Không đọc được hồ sơ doanh nghiệp đã liên kết. Liên hệ Vexim.", 409);
  if (supplier && !canSubmitProfile(supplier)) return fail("Hồ sơ không ở trạng thái cho phép nộp lại.", 409);
  let created = false;
  if (!supplier) {
    const patch = parsed.patch;
    const input: SupplierInput = {
      name: patch.name!, trade_name: patch.trade_name ?? null, display_name: patch.display_name ?? null, slug: null,
      contact_name: patch.contact_name!, contact_title: patch.contact_title ?? null,
      email: user.email, phone: patch.phone!, zalo: patch.zalo ?? null, website: patch.website ?? null,
      country: patch.country ?? "Vietnam", address: patch.address ?? null, province: patch.province ?? null,
      role: patch.role!, supplier_type: patch.supplier_type,
      markets: patch.markets ?? null, products: patch.products ?? null,
      requested_category_slugs: proposals.requested_category_slugs, requested_category_other: proposals.requested_category_other,
      tax_id: patch.tax_id ?? null, payment_terms: patch.payment_terms ?? null,
      lead_time_days: patch.lead_time_days ?? null, rating: null, notes: null,
      status: "draft", onboarding_status: "not_started", is_demo: false,
      verification_level: 0, verified_at: null, fob_publicly_visible: false, fob_updated_at: null,
      summary_i18n: patch.summary_i18n, founded_year: patch.founded_year, employees: patch.employees,
      moq_text: patch.moq_text, capacity_per_month: patch.capacity_per_month, ports: patch.ports,
      incoterms: patch.incoterms, export_markets: patch.export_markets, private_label: patch.private_label,
    };
    try {
      const draft = await store.createSupplier(input);
      let claimed = false;
      try { claimed = await store.claimSupplierForUser(user.id, draft.id); }
      catch (error) {
        await store.deleteSupplier(draft.id).catch((e) => console.error("[supplier-profile] unclaimed draft cleanup", e));
        throw error;
      }
      if (!claimed) {
        await store.deleteSupplier(draft.id).catch((e) => console.error("[supplier-profile] duplicate draft cleanup", e));
        return fail("Hồ sơ đã được tạo trong một phiên khác. Tải lại trang trước khi gửi tiếp.", 409);
      }
      supplier = draft;
      created = true;
    } catch (error) {
      console.error("[supplier-profile] cannot create first profile", error);
      return fail("Không tạo được hồ sơ doanh nghiệp. Vui lòng thử lại hoặc liên hệ Vexim.", 503);
    }
  }

  const previousStatus = supplier.onboarding_status;
  const commitmentAcceptedAt = new Date().toISOString();
  try {
    // Saving evidence does not approve the document check or publish the supplier.
    const review = await saveInitialEvidence({ store, supplierId: supplier.id, userId: user.id,
      tax: parsed.patch.tax_id!, bank: parsed.bank, documents, requested: parsed.requested });
    // The last write opens the staff queue, not the portal, RFQ inbox or public catalogue.
    supplier = await store.updateSupplier(supplier.id, { ...parsed.patch, ...proposals, categories_reviewed_at: null,
      onboarding_status: "pending", onboarding_note: null });
    await store.addAuditLog({ actor_id: user.id, actor_email: user.email,
      entity: "supplier", entity_id: supplier.id, action: created ? "supplier.first_profile_submitted" : "supplier.profile_submitted",
      before: { onboarding_status: created ? null : previousStatus },
      after: { onboarding_status: "pending", review_id: review.id, documents: documents.length,
        requested_steps: parsed.requested, category_proposals: proposals.requested_category_slugs,
        supplier_commitments: {
          terms_of_service: { accepted: parsed.commitments.terms_of_service_accepted, version: "v1", path: "/terms-of-service" },
          information_accuracy: { confirmed: parsed.commitments.information_accuracy_confirmed,
            scope: ["product_name", "product_price", "delivery_time"] },
          accepted_at: commitmentAcceptedAt,
        } } })
      .catch((error) => console.error("[supplier-profile] audit log failed", error));
    // AI dịch MOQ và thị trường xuất khẩu sang tiếng Anh, đồng thời soạn phần giới thiệu
    // tiếng Anh từ dữ kiện hồ sơ nếu NCC để trống. Lỗi dịch không chặn việc nộp hồ sơ.
    await ensureSupplierProfileEnglish(store, supplier.id, { id: user.id, email: user.email })
      .catch((error) => console.error("[supplier-profile] translation failed", error));
    let notification: "sent" | "simulated" | "failed" = "failed";
    try { notification = await notifySupplierRegistration(supplier, parsed.requested); }
    catch (error) { console.error("[supplier-profile] staff notification failed", error); }
    revalidatePath("/supplier/portal");
    revalidatePath(`/crm/suppliers/${supplier.id}`);
    return NextResponse.json({ ok: true, notification, message: "Đã gửi hồ sơ doanh nghiệp cho Vexim. Bạn có thể đăng nhập xem trạng thái nhưng chưa dùng được các chức năng cho đến khi Vexim mở quyền." });
  } catch (error) {
    console.error("[supplier-profile] submission failed", error);
    // If evidence failed, keep the private linked draft so the same account can retry, not a new company.
    return fail("Chưa hoàn tất nộp hồ sơ. Hãy tải lại và thử tiếp trên cùng tài khoản; nếu đã tải giấy tờ, hỏi Vexim trước khi tải lại.", 503);
  }
}
