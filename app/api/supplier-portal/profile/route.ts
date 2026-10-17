import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { canSubmitProfile } from "@/lib/supplier-portal/onboarding";
import { parseSupplierProfile } from "@/lib/supplier-portal/profile-input";
import { categoryProposalOptions, parseSupplierCategoryProposals } from "@/lib/supplier-portal/category-proposals";
import { prepareInitialDocuments, saveInitialEvidence } from "@/lib/supplier-portal/profile-evidence";
import { notifySupplierRegistration } from "@/lib/supplier-portal/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/** Authenticated supplier may submit only its own profile, never approve itself or publish. */
export async function POST(request: Request) {
  const access = await supplierPortalAccess();
  if (!access) return fail("Cần đăng nhập bằng tài khoản nhà cung cấp.", 403);
  if (!canSubmitProfile(access.supplier)) return fail("Hồ sơ không ở trạng thái cho phép nộp lại.", 409);
  if (Number(request.headers.get("content-length") ?? 0) > 78 * 1024 * 1024) return fail("Tệp quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }
  let parsed: ReturnType<typeof parseSupplierProfile>;
  let documents: Awaited<ReturnType<typeof prepareInitialDocuments>>;
  try { parsed = parseSupplierProfile(form); documents = await prepareInitialDocuments(form); }
  catch (error) { return fail(error instanceof Error ? error.message : "Hồ sơ không hợp lệ."); }
  const { supplier, user, store } = access;
  let choices: ReturnType<typeof categoryProposalOptions>;
  try { choices = categoryProposalOptions(await store.listCategories({ publishedOnly: true })); }
  catch { return fail("Không đọc được danh mục Vexim. Vui lòng thử lại sau.", 503); }
  let proposals: ReturnType<typeof parseSupplierCategoryProposals>;
  try { proposals = parseSupplierCategoryProposals(form, choices); }
  catch (error) { return fail(error instanceof Error ? error.message : "Danh mục không hợp lệ."); }
  try {
    // Re-check the persistent access state before any write. Never accept status/owner from FormData.
    const fresh = await store.getSupplier(supplier.id);
    if (!fresh || !canSubmitProfile(fresh) || user.supplier_id !== fresh.id) return fail("Hồ sơ đã đổi trạng thái. Tải lại trang.", 409);
    const review = await saveInitialEvidence({
      store, supplierId: fresh.id, userId: user.id, tax: parsed.patch.tax_id!,
      bank: parsed.bank, documents, requested: parsed.requested,
    });
    // Last write opens the staff queue, NOT portal usage, public listing or an audit approval.
    await store.updateSupplier(fresh.id, { ...parsed.patch, ...proposals, categories_reviewed_at: null,
      onboarding_status: "pending", onboarding_note: null });
    await store.addAuditLog({ actor_id: user.id, actor_email: user.email,
      entity: "supplier", entity_id: fresh.id, action: "supplier.profile_submitted",
      before: { onboarding_status: fresh.onboarding_status },
      after: { onboarding_status: "pending", review_id: review.id, documents: documents.length,
        requested_steps: parsed.requested, category_proposals: proposals.requested_category_slugs } })
      .catch((error) => console.error("[supplier-profile] audit log failed after saving profile", error));
    let notification: "sent" | "simulated" | "failed" = "failed";
    try { notification = await notifySupplierRegistration({ ...fresh, ...parsed.patch }, parsed.requested); }
    catch (error) { console.error("[supplier-profile] notification failed", error); }
    revalidatePath("/supplier/portal");
    revalidatePath(`/crm/suppliers/${fresh.id}`);
    return NextResponse.json({ ok: true, notification, message: "Đã gửi hồ sơ. Tài khoản đang chờ Vexim xác nhận; bạn chưa thể sử dụng các tính năng trong cổng." });
  } catch (error) {
    console.error("[supplier-profile] submission failed", error);
    return fail("Chưa hoàn tất nộp hồ sơ. Vui lòng thử lại; nếu đã tải giấy tờ, kiểm tra với Vexim trước khi tải lại.", 503);
  }
}
