import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { validateUpload, extensionFor } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";
import { notifySupplierCertificateSubmission } from "@/lib/supplier-portal/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
const text = (form: FormData, key: string, length: number) => String(form.get(key) ?? "").trim().slice(0, length);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** New certificates are private, pending claims. This route has no staff/publication controls. */
export async function POST(request: Request) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return fail("Tài khoản NCC chưa được Vexim xác nhận.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 16 * 1024 * 1024) return fail("Tệp vượt quá 15 MB.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("Không đọc được biểu mẫu."); }
  const name = text(form, "name", 120);
  const holder = text(form, "holder_name", 160);
  const scope = text(form, "scope_text", 400);
  const issuer = text(form, "issuer", 160);
  const number = text(form, "number", 100);
  const until = text(form, "valid_until", 10);
  const file = form.get("file");
  if (!name || !holder || !scope || !issuer) return fail("Nhập tên, đơn vị đứng tên, tổ chức cấp và phạm vi chứng nhận.");
  if (/\bFDA\s+(?:approved|certified|chứng nhận|phê duyệt)\b/i.test(name)) return fail("FDA registration không đồng nghĩa FDA phê duyệt/chứng nhận sản phẩm. Hãy ghi chính xác loại đăng ký.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || !Number.isFinite(Date.parse(`${until}T00:00:00Z`)) ||
      new Date(`${until}T00:00:00Z`).toISOString().slice(0, 10) !== until || until < new Date().toISOString().slice(0, 10))
    return fail("Cần nhập ngày hết hạn chứng nhận hợp lệ và chưa qua ngày hiện tại.");
  if (!(file instanceof File) || !file.size || file.size > 15 * 1024 * 1024) return fail("Chọn PDF/ảnh chứng nhận, tối đa 15 MB.");
  const requested = [...new Set(form.getAll("product_ids").map(String))];
  if (requested.length > 30 || requested.some((id) => !uuid.test(id))) return fail("Danh sách sản phẩm không hợp lệ.");
  const products = await access.store.listProductsBySupplier(access.supplier.id);
  if (requested.some((id) => !products.some((p) => p.id === id))) return fail("Sản phẩm chọn không thuộc NCC của bạn.", 403);
  if ((await access.store.listCertificates(access.supplier.id)).length >= 50) return fail("Đã tới giới hạn 50 hồ sơ chứng nhận; liên hệ Vexim để bổ sung.", 409);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateUpload("certificate", bytes, file.name);
  if (!checked.ok || !checked.mime) return fail(checked.message ?? "Tệp không hợp lệ.");
  const path = `suppliers/${access.supplier.id}/certificates/${randomUUID()}.${extensionFor(checked.mime)}`;
  let mediaId: string | null = null;
  try {
    // A suspended account cannot finish an in-flight upload after access was revoked.
    const currentSupplier = await access.store.getSupplier(access.supplier.id);
    if (!currentSupplier || !portalApproved(currentSupplier)) return fail("Quyền cổng NCC đã thay đổi; không thể nộp tệp.", 403);
    await putObject(path, bytes, checked.mime);
    const media = await access.store.createMedia({
      owner_type: "supplier", supplier_id: access.supplier.id, product_id: null, verification_id: null,
      checklist_key: null, kind: "certificate", audience: "internal", status: "unverified",
      expires_on: until, caption: name, storage_path: path, thumb_path: null, external_url: null,
      mime: checked.mime, bytes: bytes.length, width: null, height: null, sort_order: 0, created_by: access.user.id,
    });
    mediaId = media.id;
    const cert = await access.store.createCertificate({
      supplier_id: access.supplier.id, name, holder_name: holder, scope_text: scope,
      issuer, number: number || null, valid_until: until, file_media_id: media.id,
      requested_product_ids: requested, approved_product_ids: [],
      review_status: "pending", review_note: null, publicly_visible: false,
      check_status: "on_file", checked_at: null, checked_by: null, notes: null,
    });
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "supplier", entity_id: access.supplier.id, action: "supplier.certificate_submitted",
      before: null, after: { certificate_id: cert.id, media_id: media.id, products: requested, review: "pending", visible: false } })
      .catch((error) => console.error("[certificate] audit", error));
    // Notification failure never approves or publishes a certificate; the CRM review list remains authoritative.
    try { await notifySupplierCertificateSubmission(access.supplier, cert.name); }
    catch (error) { console.error("[certificate] notify", error); }
    revalidatePath("/supplier/portal/certificates");
    revalidatePath(`/crm/suppliers/${access.supplier.id}/certificates`);
    return NextResponse.json({ ok: true, message: "Đã nộp chứng nhận cho Vexim kiểm tra. Chưa được duyệt hoặc công khai." });
  } catch (error) {
    console.error("[certificate] upload", error);
    if (mediaId) await access.store.deleteMedia(mediaId).catch((e) => console.error("[certificate] cleanup media", e));
    await deleteObject(path).catch((e) => console.error("[certificate] cleanup storage", e));
    return fail("Không lưu được chứng nhận; kiểm tra cấu hình/migration rồi thử lại.", 503);
  }
}
