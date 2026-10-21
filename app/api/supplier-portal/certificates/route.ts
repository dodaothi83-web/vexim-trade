import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { validateUpload, extensionFor } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";
import {
  defaultCertificateLabelForKey,
  holderMatchBadgeLabel,
  ingestCertificateScan,
  isL1CertificateKey,
} from "@/lib/certificate-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status });
const text = (form: FormData, key: string, length: number) =>
  String(form.get(key) ?? "").trim().slice(0, length);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * NCC tải giấy chứng nhận trong luồng L1: chỉ cần tệp PDF/ảnh (+ nhãn hoặc mã chứng nhận cần cập nhật lại).
 * AI tự quét đơn vị đứng tên (chính chủ hay đối tác) và ngày hết hạn để hiển thị lên trang công khai.
 */
export async function POST(request: Request) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) {
    return fail("Tài khoản NCC chưa được Vexim xác nhận.", 403);
  }
  if (Number(request.headers.get("content-length") ?? 0) > 16 * 1024 * 1024) {
    return fail("Tệp vượt quá 15 MB.", 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Không đọc được biểu mẫu.");
  }

  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > 15 * 1024 * 1024) {
    return fail("Chọn PDF/ảnh chứng nhận, tối đa 15 MB.");
  }

  const checklistKeyRaw = text(form, "checklist_key", 60) || text(form, "checklistKey", 60);
  const checklistKey = isL1CertificateKey(checklistKeyRaw) ? checklistKeyRaw : null;
  const label =
    text(form, "label", 140) ||
    text(form, "name", 140) ||
    (checklistKey ? defaultCertificateLabelForKey(checklistKey) : "Giấy chứng nhận");
  const certificateIdRaw = text(form, "certificate_id", 40);
  const existingCertificateId =
    certificateIdRaw && uuid.test(certificateIdRaw) ? certificateIdRaw : null;

  const existingList = await access.store.listCertificates(access.supplier.id);
  if (existingCertificateId && !existingList.some((c) => c.id === existingCertificateId)) {
    return fail("Không tìm thấy chứng nhận cần cập nhật của doanh nghiệp bạn.", 404);
  }
  if (!existingCertificateId && existingList.length >= 50) {
    return fail("Đã tới giới hạn 50 hồ sơ chứng nhận; hãy bấm cập nhật vào chứng nhận hiện có.", 409);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateUpload("certificate", bytes, file.name);
  if (!checked.ok || !checked.mime) {
    return fail(checked.message ?? "Tệp không hợp lệ.");
  }

  const path = `suppliers/${access.supplier.id}/certificates/${randomUUID()}.${extensionFor(checked.mime)}`;
  let mediaId: string | null = null;
  try {
    const currentSupplier = await access.store.getSupplier(access.supplier.id);
    if (!currentSupplier || !portalApproved(currentSupplier)) {
      return fail("Quyền cổng NCC đã thay đổi; không thể nộp tệp.", 403);
    }

    await putObject(path, bytes, checked.mime);
    const media = await access.store.createMedia({
      owner_type: "supplier",
      supplier_id: access.supplier.id,
      product_id: null,
      verification_id: access.review?.target_level === 1 ? access.review.id : null,
      checklist_key: checklistKey,
      kind: "certificate",
      audience: "internal",
      status: "unverified",
      expires_on: null,
      caption: label,
      storage_path: path,
      thumb_path: null,
      external_url: null,
      mime: checked.mime,
      bytes: bytes.length,
      width: null,
      height: null,
      sort_order: 0,
      created_by: access.user.id,
    });
    mediaId = media.id;

    const { certificate, decision } = await ingestCertificateScan({
      supplier: currentSupplier,
      mediaId: media.id,
      bytes,
      storagePath: path,
      declaredLabel: label,
      checklistKey,
      verificationId: access.review?.target_level === 1 ? access.review.id : null,
      existingCertificateId,
      source: "l1-supplier",
      actor: { id: access.user.id, email: access.user.email },
    });

    revalidatePath("/supplier/portal");
    revalidatePath(`/crm/suppliers/${access.supplier.id}`);
    revalidatePath(`/crm/suppliers/${access.supplier.id}/audit/documents`);
    if (currentSupplier.slug) {
      revalidatePath(`/suppliers/${currentSupplier.slug}`);
    }

    const holderBadge = holderMatchBadgeLabel(certificate.holder_match, certificate.holder_name);
    const message = decision.autoPublish
      ? `AI đã quét “${certificate.name}”: ${holderBadge} · hết hạn ${certificate.valid_until}. Đã tự động hiển thị trên hồ sơ.`
      : `Đã lưu “${certificate.name}”. ${decision.review_note}`;

    return NextResponse.json({
      ok: true,
      message,
      certificate: {
        id: certificate.id,
        name: certificate.name,
        holder_match: certificate.holder_match ?? "unclear",
        holder_name: certificate.holder_name ?? null,
        valid_until: certificate.valid_until,
        publicly_visible: Boolean(certificate.publicly_visible && !certificate.staff_hidden),
        review_status: certificate.review_status,
        review_note: certificate.review_note ?? null,
      },
    });
  } catch (error) {
    console.error("[certificate] upload", error);
    if (mediaId) {
      await access.store.deleteMedia(mediaId).catch((e) => console.error("[certificate] cleanup media", e));
    }
    await deleteObject(path).catch((e) => console.error("[certificate] cleanup storage", e));
    return fail("Không lưu được chứng nhận; kiểm tra cấu hình/migration rồi thử lại.", 503);
  }
}
