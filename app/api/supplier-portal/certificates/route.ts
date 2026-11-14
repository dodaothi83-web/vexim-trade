import { NextResponse } from "next/server";
import { getLocale } from "@/lib/i18n/server";
import { certificateExpired, formatCertificateDate } from "@/lib/certificate-supplier-copy";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { validateUpload, extensionFor } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";
import {
  defaultCertificateLabelForKey,
  ingestCertificateScan,
  isL1CertificateKey,
  PARTNER_CONTRACT_CAPTION,
} from "@/lib/certificate-service";
import { refreshCrmBadges } from "@/lib/crm/badges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const fail = (message: string, status = 400) =>
  NextResponse.json({ ok: false, message }, { status });
const text = (form: FormData, key: string, length: number) =>
  String(form.get(key) ?? "").trim().slice(0, length);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * NCC tải giấy chứng nhận trong luồng L1: chỉ cần tệp PDF/ảnh (+ nhãn hoặc mã chứng nhận cần cập nhật lại).
 * Hệ thống đọc đơn vị đứng tên (chính chủ hay đối tác) và ngày hết hạn; nhân viên vẫn là
 * người duyệt và chọn phạm vi trước khi giấy hiện với người mua.
 */
export async function POST(request: Request) {
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) {
    return fail("Tài khoản nhà cung cấp chưa được xác nhận.", 403);
  }
  // Chứng nhận và hợp đồng kèm theo, mỗi tệp tối đa 15 MB.
  if (Number(request.headers.get("content-length") ?? 0) > 31 * 1024 * 1024) {
    return fail("Tệp vượt quá 15 MB.", 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Không đọc được biểu mẫu.");
  }

  // Từ 11/2026 mọi nhà cung cấp tải chứng nhận được ngay. Giấy đứng tên nhà máy khác chỉ
  // hiện cho người mua sau khi nhân viên xem hợp đồng/ủy quyền với nhà máy đó (tải kèm bên dưới).

  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > 15 * 1024 * 1024) {
    return fail("Chọn PDF/ảnh chứng nhận, tối đa 15 MB.");
  }

  // NCC chỉ tải tệp lên kho chung, không chọn ngăn: loại giấy do nhân viên phân loại.
  // Mã checklist chỉ còn nhận từ luồng nội bộ (L1 staff) để giữ tương thích.
  const checklistKeyRaw = text(form, "checklist_key", 60) || text(form, "checklistKey", 60);
  const checklistKey = isL1CertificateKey(checklistKeyRaw) ? checklistKeyRaw : null;
  const label =
    text(form, "label", 140) ||
    text(form, "name", 140) ||
    (checklistKey ? defaultCertificateLabelForKey(checklistKey) : "Giấy chứng nhận");
  /*
   * `certificate_id` = tải bản mới cho giấy đã có (gia hạn). Bản mới là một bản ghi
   * riêng chờ duyệt; bản cũ vẫn hiệu lực và vẫn giữ phạm vi cho tới khi bản mới được
   * duyệt, nên sản phẩm không bị mất nhãn trong lúc chờ.
   */
  const certificateIdRaw = text(form, "certificate_id", 40);
  const renewalOfId = certificateIdRaw && uuid.test(certificateIdRaw) ? certificateIdRaw : null;

  const existingList = await access.store.listCertificates(access.supplier.id);
  const renewalSource = renewalOfId ? existingList.find((c) => c.id === renewalOfId) : null;
  if (renewalOfId && !renewalSource) {
    return fail("Không tìm thấy chứng nhận cần cập nhật của doanh nghiệp bạn.", 404);
  }
  if (renewalSource?.superseded_by_certificate_id) {
    return fail("Giấy này đã có bản mới hơn. Tải cho giấy mới nhất trong danh sách.", 409);
  }
  if (!renewalOfId && existingList.length >= 50) {
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
      return fail("Quyền cổng nhà cung cấp đã thay đổi; không thể nộp tệp.", 403);
    }

    await putObject(path, bytes, checked.mime);
    // Tệp thuộc kho nội bộ của nhà cung cấp. Liên kết đợt L1 và checklist nằm trên
    // bản ghi chứng nhận bên dưới; media thuộc supplier không được gắn hai ID chủ sở hữu.
    const media = await access.store.createMedia({
      owner_type: "supplier",
      supplier_id: access.supplier.id,
      product_id: null,
      verification_id: null,
      checklist_key: null,
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

    const { certificate } = await ingestCertificateScan({
      supplier: currentSupplier,
      mediaId: media.id,
      bytes,
      storagePath: path,
      declaredLabel: label,
      checklistKey,
      verificationId: access.review?.target_level === 1 ? access.review.id : null,
      existingCertificateId: null,
      renewalOfId,
      source: "l1-supplier",
      actor: { id: access.user.id, email: access.user.email },
    });

    revalidatePath("/supplier/portal");
    revalidatePath(`/crm/suppliers/${access.supplier.id}`);
    revalidatePath(`/crm/suppliers/${access.supplier.id}/audit/documents`);
    if (currentSupplier.slug) {
      revalidatePath(`/suppliers/${currentSupplier.slug}`);
    }
    revalidatePath("/crm/certificates");
    // Giấy vừa tải vào hàng chờ duyệt: huy hiệu sidebar của CRM phải tăng ngay.
    refreshCrmBadges();

    // Tải từ trang sản phẩm: tự gửi yêu cầu gắn giấy cho sản phẩm đó, để nhân viên thấy sẵn
    // danh mục của sản phẩm khi duyệt (11/2026). Chỉ nhận sản phẩm của chính nhà cung cấp.
    const productId = text(form, "product_id", 40);
    if (productId && uuid.test(productId)) {
      const product = await access.store.getProduct(productId).catch(() => null);
      if (product?.supplier_id === access.supplier.id) {
        await access.store.updateCertificate(certificate.id, {
          requested_product_ids: [...new Set([...(certificate.requested_product_ids ?? []), productId])],
        }).catch((error) => console.error("[certificate] product request", error));
      }
    }

    // Hợp đồng / ủy quyền với nhà máy (tùy chọn). Lỗi ở đây không làm mất chứng nhận vừa lưu.
    const contractSaved = await saveRelationshipFile(form, access.supplier.id, access.user.id, certificate.holder_name ?? label, access.store);

    /* Giấy vào hồ sơ; lên sản phẩm hay không là do nhân viên chọn phạm vi, nên không hứa
     * "đã hiển thị". Riêng giấy AI đọc ra đã hết hạn thì nói ngay: giấy này không đăng được. */
    const en = (await getLocale()) === "en";
    const expired = certificateExpired(certificate.valid_until);
    const expiredOn = formatCertificateDate(certificate.valid_until, en ? "en" : "vi");
    const base = expired
      ? en ? `Received “${certificate.name}”, but it expired on ${expiredOn}, so it cannot be shown to buyers. Please upload the renewed copy.`
        : `Đã nhận “${certificate.name}”, nhưng giấy đã hết hạn ngày ${expiredOn} nên chưa đăng được. Vui lòng tải bản đã gia hạn.`
      : en ? `Received “${certificate.name}”. Vexim checks it and chooses the categories it applies to before it shows on products.`
        : `Đã nhận “${certificate.name}”. Nhân viên đối chiếu và chọn phạm vi áp dụng trước khi giấy lên sản phẩm.`;
    const contractNote = contractSaved === "saved" ? (en ? " The factory contract was received too." : " Đã nhận cả hợp đồng với nhà máy.")
      : contractSaved === "failed" ? (en ? " The contract file was not saved; please upload it again." : " Chưa lưu được tệp hợp đồng; vui lòng tải lại hợp đồng.") : "";
    const message = base + contractNote;

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
    return fail(mediaId
      ? "Hệ thống chưa hoàn tất xử lý chứng nhận. Kiểm tra danh sách sau khi tải lại trang; nếu chưa thấy, hãy liên hệ Vexim."
      : "Lỗi hệ thống: chứng nhận chưa được ghi nhận. Bạn không cần đổi tên trên giấy; hãy liên hệ Vexim để được hỗ trợ.", 503);
  }
}

/**
 * Tệp hợp đồng hoặc giấy ủy quyền với nhà máy đứng tên trên chứng nhận (không bắt buộc).
 * Lưu là tệp nội bộ của nhà cung cấp; nhân viên mở ra xem trước khi duyệt giấy của nhà máy khác.
 */
async function saveRelationshipFile(form: FormData, supplierId: string, userId: string, holder: string,
  store: NonNullable<Awaited<ReturnType<typeof supplierPortalAccess>>>["store"]): Promise<"none" | "saved" | "failed"> {
  const file = form.get("relationship_file");
  if (!(file instanceof File) || !file.size) return "none";
  if (file.size > 15 * 1024 * 1024) return "failed";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateUpload("certificate", bytes, file.name);
  if (!checked.ok || !checked.mime) return "failed";
  const path = `suppliers/${supplierId}/partner-contracts/${randomUUID()}.${extensionFor(checked.mime)}`;
  try {
    await putObject(path, bytes, checked.mime);
    await store.createMedia({
      owner_type: "supplier", supplier_id: supplierId, product_id: null, verification_id: null,
      checklist_key: null, kind: "document", audience: "internal", status: "unverified", expires_on: null,
      caption: `${PARTNER_CONTRACT_CAPTION} · ${holder}`.slice(0, 200),
      storage_path: path, thumb_path: null, external_url: null, mime: checked.mime, bytes: bytes.length,
      width: null, height: null, sort_order: 0, created_by: userId,
    });
    return "saved";
  } catch (error) {
    console.error("[certificate] relationship file", error);
    await deleteObject(path).catch(() => undefined);
    return "failed";
  }
}
