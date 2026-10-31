"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { holderMatchBadgeLabel, ingestCertificateScan } from "@/lib/certificate-service";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";

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
  revalidatePath("/supplier/portal");
  if (slug) revalidatePath(`/suppliers/${slug}`);
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
