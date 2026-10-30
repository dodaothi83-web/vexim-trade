"use server";

import { submissionEvidenceErrorMessage } from "@/lib/supplier-portal/submission-evidence-errors";

import { revalidatePath } from "next/cache";

import { supplierSubmissionAccess } from "@/lib/supplier-portal/submission-access";
import { removeSubmissionItem } from "@/lib/supplier-portal/submission-evidence";
import { submissionEditable } from "@/lib/verification-submission";
import {
  addSourceLink,
  issueCodeForSubmission,
  saveShipmentDetails,
} from "@/lib/verification-submission-service";
import type { MediaAsset } from "@/lib/types";

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
  const id = String(form.get("submission_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: "Không mở được hồ sơ của doanh nghiệp bạn." };
  if (!submissionEditable(access.submission.status)) {
    return { ok: false, message: "Hồ sơ đang chờ xét duyệt hoặc đã được nhận nên không phát hành mã mới." };
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
      message: `Đã phát hành mã ${issued.code}. Viết tay mã này lên giấy, cầm vào khung hình khi chụp các ảnh có 🔖. Ảnh 🔖 chụp trước thời điểm phát hành sẽ bị nêu cờ.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Không phát hành được mã." };
  }
}

/** Lưu thông tin lô hàng L3 do NCC tự khai (supplier-stated, chưa xác minh). */
export async function saveShipmentAction(form: FormData): Promise<SubmissionActionResult> {
  const id = String(form.get("submission_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: "Không mở được hồ sơ của doanh nghiệp bạn." };
  if (access.submission.target_level !== 3) return { ok: false, message: "Mục này chỉ dành cho hồ sơ lịch sử xuất khẩu." };
  try {
    await saveShipmentDetails(access.store, {
      submission: access.submission,
      shipmentRef: String(form.get("shipment_ref") ?? ""),
      shippedOn: String(form.get("shipped_on") ?? ""),
      destination: String(form.get("destination") ?? ""),
      note: String(form.get("note") ?? ""),
    });
    revalidate(id);
    return { ok: true, message: "Đã lưu thông tin lô hàng tự khai. Đây là khai báo của doanh nghiệp, không phải dữ liệu Hải quan." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Không lưu được." };
  }
}

/** Khai link nguồn công khai cho lịch sử xuất khẩu. */
export async function addSourceLinkAction(form: FormData): Promise<SubmissionActionResult> {
  const id = String(form.get("submission_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: "Không mở được hồ sơ của doanh nghiệp bạn." };
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
        ? "Đã lưu link nguồn công khai để nhân viên đối chiếu."
        : `Đã lưu link. ${assessment.reason}`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Không lưu được link." };
  }
}

export async function deleteSourceLinkAction(form: FormData): Promise<SubmissionActionResult> {
  const id = String(form.get("submission_id") ?? "");
  const linkId = String(form.get("link_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: "Không mở được hồ sơ của doanh nghiệp bạn." };
  if (!submissionEditable(access.submission.status)) return { ok: false, message: "Hồ sơ đã nộp hoặc đã xét." };
  if (!access.links.some((l) => l.id === linkId)) return { ok: false, message: "Link không thuộc hồ sơ này." };
  await access.store.deleteSubmissionLink(linkId);
  revalidate(id);
  return { ok: true, message: "Đã xoá link." };
}

/** Xoá bằng chứng đã tải (chỉ khi hồ sơ còn mở và tệp thuộc đúng hồ sơ). */
export async function deleteSubmissionItemAction(form: FormData): Promise<SubmissionActionResult> {
  const id = String(form.get("submission_id") ?? "");
  const itemId = String(form.get("item_id") ?? "");
  const access = await supplierSubmissionAccess(id);
  if (!access) return { ok: false, message: "Không mở được hồ sơ của doanh nghiệp bạn." };
  if (!submissionEditable(access.submission.status)) {
    return { ok: false, message: "Hồ sơ đang chờ xét duyệt hoặc đã được nhận; bằng chứng bị khoá." };
  }
  const item = access.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, message: "Không tìm thấy bằng chứng trong hồ sơ này." };
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
    return { ok: true, message: "Đã xoá bằng chứng khỏi hồ sơ." };
  } catch (error) {
    return { ok: false, message: submissionEvidenceErrorMessage(error) ?? (error instanceof Error ? error.message : "Không xoá được.") };
  }
}
