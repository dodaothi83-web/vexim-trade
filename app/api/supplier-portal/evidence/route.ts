import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { canUploadOwnDocument } from "@/lib/supplier-portal/policy";
import { MAX_DOCUMENT_BYTES, saveDocumentEvidence, validateInitialDocument } from "@/lib/supplier-portal/evidence";
import type { AuditEvidenceKey } from "@/lib/types";

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
  if (!(file instanceof File) || !canUploadOwnDocument(access.user, access.review, key)) {
    return NextResponse.json({ ok: false, message: "Chỉ được tải giấy tờ bước đầu của chính doanh nghiệp khi đợt kiểm còn mở." }, { status: 403 });
  }
  try {
    const prepared = await validateInitialDocument(file, key);
    const fresh = await access.store.getVerification(access.review.id);
    if (!fresh || !canUploadOwnDocument(access.user, fresh, key)) {
      return NextResponse.json({ ok: false, message: "Đợt kiểm đã khóa; không thể tải lên." }, { status: 403 });
    }
    const row = await saveDocumentEvidence({ store: access.store, review: fresh, key: key as AuditEvidenceKey, file, prepared, createdBy: access.user.id });
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "supplier", entity_id: access.supplier.id, action: "supplier.document_upload.l1",
      before: null, after: { verification_id: fresh.id, media_id: row.id, checklist_key: key } });
    revalidatePath("/supplier/portal");
    revalidatePath(`/crm/suppliers/${access.supplier.id}`);
    return NextResponse.json({ ok: true, message: "Đã tải giấy tờ để Vexim đối chiếu; chưa được xác minh." });
  } catch (error) {
    console.error("[supplier-portal] upload error", error);
    return NextResponse.json({ ok: false, message: "Không lưu được tệp. Kiểm tra định dạng JPG/PNG/WebP/PDF và migration CSDL; thử lại sau." }, { status: 503 });
  }
}
