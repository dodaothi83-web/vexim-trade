import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { canSubmitProfile } from "@/lib/supplier-portal/onboarding";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { MAX_INITIAL_FILES, saveDocumentEvidence, validateInitialDocument } from "@/lib/supplier-portal/evidence";
import { notifySupplierRegistration } from "@/lib/supplier-portal/notify";
import { L1_DOC_ITEMS, type SupplierType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const text = (form: FormData, key: string, limit = 200) => String(form.get(key) ?? "").trim().slice(0, limit);
const TYPES: SupplierType[] = ["manufacturer", "trading", "cooperative"];

/** Authenticated supplier may submit only its own profile, never approve itself or publish. */
export async function POST(request: Request) {
  const access = await supplierPortalAccess();
  if (!access) return fail("Cần đăng nhập bằng tài khoản nhà cung cấp.", 403);
  if (!canSubmitProfile(access.supplier)) return fail("Hồ sơ không ở trạng thái cho phép nộp lại.", 409);
  if (Number(request.headers.get("content-length") ?? 0) > 78 * 1024 * 1024) return fail("Tệp quá lớn.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }
  if (text(form, "consent") !== "yes") return fail("Vui lòng xác nhận gửi thông tin cho Vexim.");
  const name = text(form, "name", 180);
  const contact = text(form, "contact_name", 120);
  const phone = text(form, "phone", 40);
  const products = text(form, "products", 1000);
  const tax = text(form, "tax_number", 32);
  const bank = text(form, "bank_account_number", 34);
  const supplierType = text(form, "supplier_type") as SupplierType;
  if (name.length < 3 || !contact || !phone || !products) return fail("Cần tên doanh nghiệp, người liên hệ, số điện thoại và mặt hàng chính.");
  if (!TYPES.includes(supplierType)) return fail("Chọn nhà máy, thương nhân hoặc hợp tác xã hợp lệ.");
  if (!/^[0-9]{1,32}$/.test(tax) || !/^[0-9]{1,34}$/.test(bank)) return fail("Mã số thuế và số tài khoản phải là chữ số.");
  const documents: { key: typeof INITIAL_DOCUMENT_KEYS[number]; file: File; prepared: Awaited<ReturnType<typeof validateInitialDocument>> }[] = [];
  try {
    for (const key of INITIAL_DOCUMENT_KEYS) {
      for (const value of form.getAll(`doc:${key}`)) {
        if (!(value instanceof File) || !value.size) continue;
        if (documents.length >= MAX_INITIAL_FILES) return fail(`Tối đa ${MAX_INITIAL_FILES} giấy tờ bước đầu.`);
        documents.push({ key, file: value, prepared: await validateInitialDocument(value, key) });
      }
    }
  } catch (error) { return fail(error instanceof Error ? error.message : "Tệp không hợp lệ."); }
  const requested = ([2, 3] as const).filter((level) => form.get(`request:${level}`) === "yes");
  const { supplier, user, store } = access;
  try {
    // Re-check the persistent access state before any write. Never accept status/owner from FormData.
    const fresh = await store.getSupplier(supplier.id);
    if (!fresh || !canSubmitProfile(fresh) || user.supplier_id !== fresh.id) return fail("Hồ sơ đã đổi trạng thái. Tải lại trang.", 409);
    const oldReviews = await store.listVerifications(fresh.id);
    const review = oldReviews.find((v) => v.target_level === 1 && (v.status === "in_progress" || v.status === "returned")) ??
      await store.createVerification({
        supplier_id: fresh.id, target_level: 1, status: "in_progress", inspector_id: null,
        tax_number: tax, bank_account_number: bank,
        checklist: Object.fromEntries(L1_DOC_ITEMS.map((item) => [item.key, null])),
        checklist_notes: {}, public_summary_i18n: {},
      });
    if (review.tax_number !== tax || review.bank_account_number !== bank) {
      await store.updateVerification(review.id, { tax_number: tax, bank_account_number: bank });
    }
    for (const { key, file, prepared } of documents) {
      await saveDocumentEvidence({ store, review, key, file, prepared, createdBy: user.id });
    }
    const existing = await store.listSupplierVerificationRequests(fresh.id);
    for (const level of requested) if (!existing.some((r) => r.target_level === level)) {
      await store.createSupplierVerificationRequest(fresh.id, level);
    }
    // Last write opens the staff queue, NOT portal usage, public listing or an audit approval.
    await store.updateSupplier(fresh.id, {
      name, trade_name: text(form, "trade_name", 180) || null, contact_name: contact,
      phone, products, province: text(form, "province", 100) || null,
      address: text(form, "address", 250) || null, tax_id: tax,
      supplier_type: supplierType, role: supplierType === "manufacturer" ? "manufacturer" : "trader",
      onboarding_status: "pending", onboarding_note: null,
    });
    await store.addAuditLog({ actor_id: user.id, actor_email: user.email,
      entity: "supplier", entity_id: fresh.id, action: "supplier.profile_submitted",
      before: { onboarding_status: fresh.onboarding_status },
      after: { onboarding_status: "pending", review_id: review.id, documents: documents.length, requested_steps: requested } })
      .catch((error) => console.error("[supplier-profile] audit log failed after saving profile", error));
    let notification: "sent" | "simulated" | "failed" = "failed";
    try { notification = await notifySupplierRegistration({ ...fresh, name, contact_name: contact, phone }, requested); }
    catch (error) { console.error("[supplier-profile] notification failed", error); }
    revalidatePath("/supplier/portal");
    revalidatePath(`/crm/suppliers/${fresh.id}`);
    return NextResponse.json({ ok: true, notification, message: "Đã gửi hồ sơ. Tài khoản đang chờ Vexim xác nhận; bạn chưa thể sử dụng các tính năng trong cổng." });
  } catch (error) {
    console.error("[supplier-profile] submission failed", error);
    return fail("Chưa hoàn tất nộp hồ sơ. Vui lòng thử lại; nếu đã tải giấy tờ, kiểm tra với Vexim trước khi tải lại.", 503);
  }
}
