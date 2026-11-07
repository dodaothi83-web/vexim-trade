"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { holderMatchBadgeLabel, ingestCertificateScan, isPartnerContractDocument, todayISO } from "@/lib/certificate-service";
import { approvedL2Scope } from "@/lib/verification-status";
import { partnerFactoryNameMatches } from "@/lib/certificate-holder";
import { certificateSchemeLabel, isCertificateScheme } from "@/lib/certificate-scheme";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";
import { transferRenewalScope } from "@/lib/certificate-renewal";
import { refreshCrmBadges } from "@/lib/crm/badges";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const result = (ok: boolean, message: string) => ({ ok, message });

/** Revalidation runs after the certificate write; it must never fail the action. */
async function softRefresh(work: () => void): Promise<void> {
  try {
    work();
  } catch (error) {
    console.error("[certificate] revalidate failed after the certificate was saved", error);
  }
}

function refresh(supplierId: string, slug?: string | null) {
  revalidatePath(`/crm/suppliers/${supplierId}`);
  revalidatePath(`/crm/suppliers/${supplierId}/audit/documents`);
  revalidatePath("/crm/certificates");
  revalidatePath("/supplier/portal");
  if (slug) revalidatePath(`/suppliers/${slug}`);
  // Duyệt/ẩn/đổi trạng thái làm đổi số giấy chờ duyệt: huy hiệu ở layout /crm phải tự trừ.
  refreshCrmBadges();
}

/** A thrown server action is HTTP 500 in production; certificates only ever return a soft result. */
function briefReason(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error ?? "")).replace(/\s+/g, " ").trim();
  return text.slice(0, 180) || "không rõ nguyên nhân";
}

export async function rescanCertificateAction(supplierId: string, certificateId: string) {
  try {
    return await rescanCertificate(supplierId, certificateId);
  } catch (error) {
    console.error("[certificate] rescan action failed", error);
    return result(false, `Chưa quét lại được chứng nhận (${briefReason(error)}). Dữ liệu chứng nhận giữ nguyên.`);
  }
}

async function rescanCertificate(supplierId: string, certificateId: string) {
  if ((await guard("verifications.inspect")) !== null) {
    return result(false, "Bạn không có quyền quét lại chứng nhận L1.");
  }
  const session = await getSession();
  if (!session || !hasPermission(session.role, "verifications.inspect")) {
    return result(false, "Bạn không có quyền quét lại chứng nhận L1.");
  }
  const store = getStore();
  const [supplier, cert] = await Promise.all([
    store.getSupplier(supplierId),
    store.getCertificate(certificateId),
  ]);
  if (!supplier || !cert || cert.supplier_id !== supplier.id) {
    return result(false, "Không tìm thấy chứng nhận của nhà cung cấp này.");
  }
  if (!cert.file_media_id) {
    return result(false, "Chứng nhận chưa đính kèm tệp gốc để AI quét.");
  }
  const media = await store.getMedia(cert.file_media_id);
  if (!media || media.supplier_id !== supplier.id || !media.storage_path) {
    return result(false, "Không tìm thấy tệp nội bộ của chứng nhận.");
  }

  const { certificate, decision } = await ingestCertificateScan({
    supplier,
    mediaId: media.id,
    storagePath: media.storage_path,
    declaredLabel: cert.name,
    checklistKey: cert.checklist_key ?? null,
    verificationId: cert.verification_id ?? null,
    existingCertificateId: cert.id,
    source: cert.source ?? "l1-staff",
    actor: { id: session.uid, email: session.email },
  });

  await softRefresh(() => refresh(supplier.id, supplier.slug));
  const badge = holderMatchBadgeLabel(certificate.holder_match, certificate.holder_name);
  return result(
    true,
    decision.autoPublish
      ? `Đã quét lại: ${badge} · hết hạn ${certificate.valid_until}.`
      : `Đã quét lại. ${decision.review_note}`,
  );
}

export async function approveCertificateAction(supplierId: string, certificateId: string, options: { partnerContractConfirmed?: boolean } = {}) {
  try {
    return await approveCertificate(supplierId, certificateId, options);
  } catch (error) {
    console.error("[certificate] approve action failed", error);
    return result(false, `Chưa duyệt được chứng nhận (${briefReason(error)}). Chứng nhận giữ nguyên như trước.`);
  }
}

/**
 * Nhân viên duyệt đăng một chứng nhận AI chưa tự công bố.
 *
 * Giấy đứng tên đơn vị khác (chỉ đơn vị thương mại) đăng được khi đã xác minh nhà máy đối tác
 * (L3) với đúng tên đó, hoặc khi nhân viên đã mở hợp đồng/ủy quyền nhà cung cấp tải kèm và
 * đánh dấu đã xem (từ 11/2026). Không thể đẩy giấy của doanh nghiệp không liên quan lên hồ sơ.
 */
async function approveCertificate(supplierId: string, certificateId: string, options: { partnerContractConfirmed?: boolean }) {
  if ((await guard("suppliers.publish")) !== null) {
    return result(false, "Bạn không có quyền duyệt đăng chứng nhận trên trang công khai.");
  }
  const session = await getSession();
  if (!session || !hasPermission(session.role, "suppliers.publish")) {
    return result(false, "Bạn không có quyền duyệt đăng chứng nhận trên trang công khai.");
  }
  if (!uuid.test(certificateId)) {
    return result(false, "Mã chứng nhận không hợp lệ.");
  }
  const store = getStore();
  const [supplier, cert] = await Promise.all([
    store.getSupplier(supplierId),
    store.getCertificate(certificateId),
  ]);
  if (!supplier || !cert || cert.supplier_id !== supplier.id) {
    return result(false, "Không tìm thấy chứng nhận của nhà cung cấp này.");
  }
  if (!cert.file_media_id) {
    return result(false, "Chứng nhận chưa có tệp gốc để đối chiếu; chưa đăng được.");
  }
  if (!cert.valid_until || !/^\d{4}-\d{2}-\d{2}$/.test(cert.valid_until)) {
    return result(false, "Chưa có ngày hết hạn trên giấy; chưa đăng được.");
  }
  if (cert.valid_until < todayISO()) {
    return result(false, `Giấy đã hết hạn ngày ${cert.valid_until}; chưa đăng được.`);
  }

  // Giấy đứng tên nhà máy khác (chỉ đơn vị thương mại). Hai đường được đăng:
  //  1. Đã xác minh nhà máy đối tác (L3) và tên trên giấy khớp tên nhà máy trong hồ sơ đó.
  //  2. Từ 11/2026: nhà cung cấp đã tải hợp đồng/ủy quyền với nhà máy, nhân viên mở xem và đánh dấu.
  let partnerContractReviewed = false;
  if (cert.holder_match === "partner") {
    const holderName = cert.holder_name?.trim();
    if (!holderName) {
      return result(false, "Giấy đứng tên đơn vị đối tác nhưng chưa đọc được tên; bổ sung tên trước khi đăng.");
    }
    if (supplier.supplier_type !== "trading") {
      return result(false, `Giấy đứng tên ${holderName}. Nhà máy và hợp tác xã chỉ đăng chứng nhận đứng tên chính mình.`);
    }
    const verifications = await store.listVerifications(supplier.id);
    const scope = approvedL2Scope(verifications);
    const partnerName = scope === "partner_contract" || scope === "both"
      ? verifications
        .filter((v) => v.target_level === 2 && v.status === "approved" && v.l2_scope === "partner_contract")
        .map((v) => v.partner_factory_name?.trim() ?? "")
        .find((name) => name.length > 0)
      : undefined;
    const verifiedPartner = Boolean(partnerName && partnerFactoryNameMatches(holderName, partnerName));
    if (!verifiedPartner) {
      const contracts = (await store.listMedia("supplier", supplier.id)).filter(isPartnerContractDocument);
      if (!contracts.length) {
        return result(false, `Giấy đứng tên ${holderName}. Nhà cung cấp chưa tải hợp đồng hoặc giấy ủy quyền với nhà máy này; nhờ họ tải kèm rồi duyệt.`);
      }
      if (!options.partnerContractConfirmed) {
        return result(false, `Giấy đứng tên ${holderName}. Mở hợp đồng, kiểm tra đúng tên hai bên rồi đánh dấu "Đã xem" trước khi duyệt.`);
      }
      partnerContractReviewed = true;
    }
  }

  const updated = await store.updateCertificate(cert.id, {
    review_status: "approved",
    publicly_visible: true,
  });
  if (!updated) return result(false, "Không cập nhật được trạng thái chứng nhận.");

  // Bản gia hạn: phạm vi của bản cũ chuyển sang bản mới, bản cũ ngừng hiện. Làm sau khi
  // bản mới đã duyệt nên sản phẩm không bị mất nhãn trong lúc chờ.
  const renewal = await transferRenewalScope(store, updated, {
    id: session.uid,
    email: session.email,
    at: new Date().toISOString(),
  }).catch((error) => {
    console.error("[certificate] renewal scope transfer", error);
    return { copied: 0, superseded: false };
  });

  await store
    .addAuditLog({
      actor_id: session.uid,
      actor_email: session.email,
      entity: "supplier",
      entity_id: supplier.id,
      action: "certificate.staff_approve",
      before: { id: cert.id, review_status: cert.review_status, publicly_visible: Boolean(cert.publicly_visible) },
      after: { id: cert.id, review_status: "approved", publicly_visible: true, holder_match: cert.holder_match ?? null, partner_contract_reviewed: partnerContractReviewed },
    })
    .catch((err) => console.error("[certificate] staff approve audit", err));

  await notifySupplierDecision({
    supplierId: supplier.id,
    decision: "certificate_published",
    name: cert.name,
    entityId: cert.id,
  }).catch(() => "failed");

  await softRefresh(() => refresh(supplier.id, supplier.slug));
  const renewalNote = renewal.superseded
    ? ` Đã thay bản cũ và chuyển ${renewal.copied} phạm vi sang bản này.`
    : "";
  return result(true, `Đã duyệt đăng “${cert.name}” (${holderMatchBadgeLabel(cert.holder_match, cert.holder_name)}).${renewalNote}`);
}

/**
 * Nhân viên chọn/sửa loại chứng nhận dùng cho bộ lọc người mua.
 *
 * Đây là phân loại, không phải kết luận xác minh và không mở cổng công bố nào: giấy
 * vẫn phải đã duyệt, công khai, còn hạn và được gắn sản phẩm mới lên bộ lọc.
 */
export async function setCertificateSchemeAction(supplierId: string, certificateId: string, scheme: string) {
  try {
    return await setCertificateScheme(supplierId, certificateId, scheme);
  } catch (error) {
    console.error("[certificate] set scheme failed", error);
    return result(false, `Chưa lưu được loại chứng nhận (${briefReason(error)}).`);
  }
}

async function setCertificateScheme(supplierId: string, certificateId: string, scheme: string) {
  if ((await guard("verifications.inspect")) !== null) {
    return result(false, "Bạn không có quyền phân loại chứng nhận.");
  }
  const session = await getSession();
  if (!session || !hasPermission(session.role, "verifications.inspect")) {
    return result(false, "Bạn không có quyền phân loại chứng nhận.");
  }
  if (!uuid.test(certificateId)) return result(false, "Mã chứng nhận không hợp lệ.");
  const next = scheme.trim() === "" ? null : scheme.trim();
  if (next !== null && !isCertificateScheme(next)) return result(false, "Loại chứng nhận không hợp lệ.");
  const store = getStore();
  const [supplier, cert] = await Promise.all([
    store.getSupplier(supplierId),
    store.getCertificate(certificateId),
  ]);
  if (!supplier || !cert || cert.supplier_id !== supplier.id) {
    return result(false, "Không tìm thấy chứng nhận của nhà cung cấp này.");
  }
  const updated = await store.updateCertificate(cert.id, { certificate_scheme: next });
  if (!updated) return result(false, "Không cập nhật được loại chứng nhận.");

  await store
    .addAuditLog({
      actor_id: session.uid,
      actor_email: session.email,
      entity: "supplier",
      entity_id: supplier.id,
      action: "certificate.scheme",
      before: { id: cert.id, certificate_scheme: cert.certificate_scheme ?? null },
      after: { id: cert.id, certificate_scheme: next },
    })
    .catch((err) => console.error("[certificate] scheme audit", err));

  await softRefresh(() => refresh(supplier.id, supplier.slug));
  return result(true, next
    ? `Đã phân loại “${cert.name}” là ${certificateSchemeLabel(next, "vi")}.`
    : `Đã bỏ phân loại của “${cert.name}”; giấy không còn trong bộ lọc theo chuẩn.`);
}

export async function toggleCertificateHiddenAction(
  supplierId: string,
  certificateId: string,
  hide: boolean,
) {
  try {
    return await toggleCertificateHidden(supplierId, certificateId, hide);
  } catch (error) {
    console.error("[certificate] hide/unhide action failed", error);
    return result(false, `Chưa đổi được trạng thái hiển thị (${briefReason(error)}). Chứng nhận giữ nguyên như trước.`);
  }
}

async function toggleCertificateHidden(
  supplierId: string,
  certificateId: string,
  hide: boolean,
) {
  if ((await guard("suppliers.publish")) !== null) {
    return result(false, "Bạn không có quyền ẩn/hiện chứng nhận trên trang công khai.");
  }
  const session = await getSession();
  if (!session || !hasPermission(session.role, "suppliers.publish")) {
    return result(false, "Bạn không có quyền ẩn/hiện chứng nhận trên trang công khai.");
  }
  if (!uuid.test(certificateId)) {
    return result(false, "Mã chứng nhận không hợp lệ.");
  }
  const store = getStore();
  const [supplier, cert] = await Promise.all([
    store.getSupplier(supplierId),
    store.getCertificate(certificateId),
  ]);
  if (!supplier || !cert || cert.supplier_id !== supplier.id) {
    return result(false, "Không tìm thấy chứng nhận của nhà cung cấp này.");
  }

  const nextHidden = Boolean(hide);
  const updated = await store.updateCertificate(cert.id, {
    staff_hidden: nextHidden,
  });
  if (!updated) return result(false, "Không cập nhật được trạng thái hiển thị.");

  await store
    .addAuditLog({
      actor_id: session.uid,
      actor_email: session.email,
      entity: "supplier",
      entity_id: supplier.id,
      action: nextHidden ? "certificate.staff_hide" : "certificate.staff_unhide",
      before: { id: cert.id, staff_hidden: Boolean(cert.staff_hidden) },
      after: { id: cert.id, staff_hidden: nextHidden },
    })
    .catch((err) => console.error("[certificate] toggle hide audit", err));

  if (nextHidden) {
    await notifySupplierDecision({
      supplierId: supplier.id,
      decision: "certificate_withdrawn",
      name: cert.name,
      entityId: cert.id,
    }).catch(() => "failed");
  } else if (cert.publicly_visible && cert.review_status === "approved") {
    await notifySupplierDecision({
      supplierId: supplier.id,
      decision: "certificate_published",
      name: cert.name,
      entityId: cert.id,
    }).catch(() => "failed");
  }

  await softRefresh(() => refresh(supplier.id, supplier.slug));
  return result(
    true,
    nextHidden
      ? "Đã ẩn chứng nhận khỏi trang công khai."
      : "Đã cho phép hiển thị lại chứng nhận (nếu đủ điều kiện AI & còn hạn).",
  );
}
