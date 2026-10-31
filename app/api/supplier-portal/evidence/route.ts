import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { canUploadOwnDocument } from "@/lib/supplier-portal/policy";
import { MAX_DOCUMENT_BYTES, saveDocumentEvidence, validateInitialDocument } from "@/lib/supplier-portal/evidence";
import { defaultCertificateLabelForKey, ingestCertificateScan, isL1CertificateKey } from "@/lib/certificate-service";
import { notifyStaffDocumentUpload } from "@/lib/supplier-portal/notify";
import { L1_DOC_ITEMS, type AuditEvidenceKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await supplierPortalAccess();
  if (!access?.review || !portalApproved(access.supplier)) return NextResponse.json({ ok: false, message: "Cần Vexim xác nhận tài khoản trước khi bổ sung giấy tờ." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES + 1024 * 1024) {
    return NextResponse.json({ ok: false, message: "Tệp quá lớn." }, { status: 413 });
  }
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ ok: false, message: "Không đọc được tệp." }, { status: 400 }); }
  const key = String(form.get("checklistKey") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Chọn tệp giấy tờ cần tải." }, { status: 400 });
  }
  try {
    const prepared = await validateInitialDocument(file, key);
    const fresh = await access.store.getVerification(access.review.id);
    // Đợt đã duyệt chỉ nhận bản bổ sung cho mục còn trống (giấy đăng ký kinh doanh).
    const existing = fresh ? await access.store.listMedia("verification", fresh.id).catch(() => []) : [];
    const hasFile = existing.some((asset) => asset.checklist_key === key && Boolean(asset.storage_path));
    if (!fresh || !canUploadOwnDocument(access.user, fresh, key, { hasFile })) {
      return NextResponse.json({ ok: false, message: "Ô này không mở để tải: đợt kiểm đã khóa hoặc mục đã có tệp." }, { status: 403 });
    }
    const row = await saveDocumentEvidence({ store: access.store, review: fresh, key: key as AuditEvidenceKey, file, prepared, createdBy: access.user.id });
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "supplier", entity_id: access.supplier.id, action: "supplier.document_upload.l1",
      before: null, after: { verification_id: fresh.id, media_id: row.id, checklist_key: key } });
    if (isL1CertificateKey(key)) {
      await ingestCertificateScan({
        supplier: access.supplier,
        mediaId: row.id,
        bytes: prepared.bytes,
        storagePath: row.storage_path,
        declaredLabel: defaultCertificateLabelForKey(key),
        checklistKey: key,
        verificationId: fresh.id,
        source: "l1-supplier",
        actor: { id: access.user.id, email: access.user.email },
      }).catch((err) => console.error("[supplier-portal] l1 certificate scan", err));
    }
    // Nhân viên cần biết có tệp mới để đối chiếu; thư lỗi không được làm hỏng lần tải.
    const label = L1_DOC_ITEMS.find((item) => item.key === key)?.label ?? "giấy tờ";
    const mail = await notifyStaffDocumentUpload({
      supplierId: access.supplier.id, supplierName: access.supplier.name, label,
    }).catch(() => "failed");
    if (mail !== "sent") console.warn("[supplier-portal] staff document notice not sent; upload saved", mail);
    revalidatePath("/supplier/portal");
    revalidatePath(`/crm/suppliers/${access.supplier.id}`);
    revalidatePath(`/crm/suppliers/${access.supplier.id}/audit/documents`);
    return NextResponse.json({ ok: true, message: "Đã tải giấy tờ để Vexim đối chiếu." });
  } catch (error) {
    console.error("[supplier-portal] upload error", error);
    return NextResponse.json({ ok: false, message: "Không lưu được tệp. Kiểm tra định dạng JPG/PNG/WebP/PDF và migration CSDL; thử lại sau." }, { status: 503 });
  }
}
