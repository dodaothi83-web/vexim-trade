"use server";

import { submissionEvidenceErrorMessage } from "@/lib/supplier-portal/submission-evidence-errors";

import { revalidatePath } from "next/cache";

import { supplierSubmissionAccess } from "@/lib/supplier-portal/submission-access";
import { removeSubmissionItem } from "@/lib/supplier-portal/submission-evidence";
import { submissionEditable } from "@/lib/verification-submission";
import {
  addSourceLink,
  issueCodeForSubmission,
  savePartnerFactoryName,
  saveShipmentDetails,
} from "@/lib/verification-submission-service";
import type { MediaAsset } from "@/lib/types";
import { getPortalMessages } from "@/lib/i18n/server";
import { fill } from "@/lib/i18n/format";

/** Câu trả về của action nói cùng ngôn ngữ với giao diện đang mở (cookie `vexim_locale`). */
async function actionCopy() {
  const { m } = await getPortalMessages();
  return m.verification.panel.card.actions;
}

export interface SubmissionActionResult {
  ok: boolean;
  message: string;
  /** Mã xác minh vừa phát hành (chỉ trả cho đúng chủ hồ sơ). */
  code?: string;
  href?: string;
}

function revalidate(submissionId: string) {
  revalidatePath("/supplier/portal/verification/factory");
  revalidatePath("/supplier/portal/verification/export");
  revalidatePath("/supplier/portal");
  revalidatePath(`/crm/verifications/submissions/${submissionId}`);
  revalidatePath("/crm/verifications/submissions");
}

/**
 * Phát hành mã xác minh cho hồ sơ L2. NCC in/viết tay mã này lên giấy và
 * chụp cùng 3 ảnh có đánh dấu 🔖. Mã sinh ở server, có hạn dùng và ghi audit.
 */
export async function issueSubmissionCodeAction(form: FormData): Promise<SubmissionActionResult> {
  const copy = await actionCopy();
  const id = String(form.get("submission_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: copy.noAccess };
  if (!submissionEditable(access.submission.status)) {
    return { ok: false, message: copy.codeLocked };
  }
  try {
    const supplier = await access.store.getSupplier(access.supplierId);
    const issued = await issueCodeForSubmission(access.store, {
      submission: access.submission,
      userId: access.userId,
      userEmail: access.userEmail,
      supplierName: supplier?.name ?? "",
    });
    revalidate(id);
    return {
      ok: true,
      code: issued.code,
      message: fill(copy.codeIssued, { code: issued.code }),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : copy.codeFailed };
  }
}

/** Lưu thông tin lô hàng L3 do NCC tự khai (supplier-stated, chưa xác minh). */
export async function saveShipmentAction(form: FormData): Promise<SubmissionActionResult> {
  const copy = await actionCopy();
  const id = String(form.get("submission_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: copy.noAccess };
  if (access.submission.target_level !== 3) return { ok: false, message: copy.exportOnly };
  try {
    await saveShipmentDetails(access.store, {
      submission: access.submission,
      shipmentRef: String(form.get("shipment_ref") ?? ""),
      shippedOn: String(form.get("shipped_on") ?? ""),
      destination: String(form.get("destination") ?? ""),
      note: String(form.get("note") ?? ""),
    });
    revalidate(id);
    return { ok: true, message: copy.shipmentSaved };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : copy.saveFailed };
  }
}

/** Khai tên nhà máy đối tác đúng như trên hợp đồng L2 (dùng để đối chiếu giấy chứng nhận). */
export async function savePartnerFactoryNameAction(form: FormData): Promise<SubmissionActionResult> {
  const copy = await actionCopy();
  const id = String(form.get("submission_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: copy.noAccess };
  try {
    await savePartnerFactoryName(access.store, {
      submission: access.submission,
      partnerFactoryName: String(form.get("partner_factory_name") ?? ""),
    });
    revalidate(id);
    return {
      ok: true,
      message: copy.partnerSaved,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : copy.saveFailed };
  }
}

/** Khai link nguồn công khai cho lịch sử xuất khẩu. */
export async function addSourceLinkAction(form: FormData): Promise<SubmissionActionResult> {
  const copy = await actionCopy();
  const id = String(form.get("submission_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: copy.noAccess };
  try {
    const { assessment } = await addSourceLink(access.store, {
      submission: access.submission,
      url: String(form.get("url") ?? ""),
      label: String(form.get("label") ?? "") || null,
      userId: access.userId,
    });
    await access.store.addAuditLog({
      actor_id: access.userId, actor_email: access.userEmail,
      entity: "supplier", entity_id: access.supplierId,
      action: `supplier.submission.link_added.l${access.submission.target_level}`,
      before: null, after: { submission_id: id, allowed_source: assessment.allowed, hostname: assessment.hostname },
    });
    revalidate(id);
    return {
      ok: true,
      message: assessment.allowed
        ? copy.linkSaved
        : fill(copy.linkSavedWithReason, { reason: assessment.reason }),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : copy.linkFailed };
  }
}

export async function deleteSourceLinkAction(form: FormData): Promise<SubmissionActionResult> {
  const copy = await actionCopy();
  const id = String(form.get("submission_id") ?? "");
  const linkId = String(form.get("link_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: copy.noAccess };
  if (!submissionEditable(access.submission.status)) return { ok: false, message: copy.linkLocked };
  if (!access.links.some((l) => l.id === linkId)) return { ok: false, message: copy.linkNotYours };
  await access.store.deleteSubmissionLink(linkId);
  revalidate(id);
  return { ok: true, message: copy.linkDeleted };
}

/** Xoá bằng chứng đã tải (chỉ khi hồ sơ còn mở và tệp thuộc đúng hồ sơ). */
export async function deleteSubmissionItemAction(form: FormData): Promise<SubmissionActionResult> {
  const copy = await actionCopy();
  const id = String(form.get("submission_id") ?? "");
  const itemId = String(form.get("item_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: copy.noAccess };
  if (!submissionEditable(access.submission.status)) {
    return { ok: false, message: copy.evidenceLocked };
  }
  const item = access.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, message: copy.evidenceNotFound };
  try {
    await removeSubmissionItem(access.store, item);
    // Tệp của hồ sơ tự gửi không nằm trong kho ảnh công khai của NCC.
    const orphan = item.media_id ? await access.store.getMedia(item.media_id).catch(() => null as MediaAsset | null) : null;
    void orphan;
    await access.store.addAuditLog({
      actor_id: access.userId, actor_email: access.userEmail,
      entity: "supplier", entity_id: access.supplierId,
      action: `supplier.submission.item_deleted.l${access.submission.target_level}`,
      before: null, after: { submission_id: id, item_id: itemId, checklist_key: item.checklist_key },
    });
    revalidate(id);
    return { ok: true, message: copy.evidenceDeleted };
  } catch (error) {
    return { ok: false, message: submissionEvidenceErrorMessage(error) ?? (error instanceof Error ? error.message : copy.evidenceFailed) };
  }
}
