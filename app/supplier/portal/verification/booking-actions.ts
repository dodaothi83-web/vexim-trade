"use server";

import { revalidatePath } from "next/cache";

import { supplierSubmissionAccess } from "@/lib/supplier-portal/submission-access";
import { submissionEditable } from "@/lib/verification-submission";
import { bookingMissing, cleanBookingSlots, isReviewMethod } from "@/lib/l2-call-review";
import { isPartnerL2 } from "@/lib/l2-scope";
import { notifyStaffSupplierSubmission } from "@/lib/supplier-portal/notify";
import { refreshCrmBadges } from "@/lib/crm/badges";
import { getLocale } from "@/lib/i18n/server";
import { bookingMessages } from "@/lib/i18n/portal/booking";
import type { SupplierSubmission } from "@/lib/types";

export interface BookingActionResult { ok: boolean; message: string; missing?: string[] }

function clean(value: FormDataEntryValue | null, max: number): string | null {
  return String(value ?? "").trim().slice(0, max) || null;
}

/**
 * Nhà cung cấp lưu hoặc gửi lịch hẹn xác minh L2. Lịch hẹn không phải kết quả xác minh;
 * chỉ trưởng kiểm duyệt/admin chốt giờ, gọi, ghi checklist và duyệt.
 */
export async function saveBookingAction(fd: FormData): Promise<BookingActionResult> {
  const copy = bookingMessages[await getLocale()];
  try {
    const access = await supplierSubmissionAccess(String(fd.get("submission_id") ?? ""));
    if (!access || access.submission.target_level !== 2) return { ok: false, message: copy.noAccess };
    const { submission, store } = access;
    if (!submissionEditable(submission.status)) return { ok: false, message: copy.locked };
    const partner = isPartnerL2(submission);
    const submit = fd.get("intent") === "submit";
    const method = String(fd.get("booking_method") ?? "");
    const consent = fd.get("consent") === "yes";
    const patch: Partial<SupplierSubmission> = {
      // Nhà máy đối tác luôn gọi video từ chính nhà máy đó.
      booking_method: partner ? "video_call" : isReviewMethod(method) ? method : null,
      booking_contact_name: clean(fd.get("contact_name"), 160),
      booking_contact_role: clean(fd.get("contact_role"), 120),
      booking_contact_phone: clean(fd.get("contact_phone"), 30),
      booking_factory_address: clean(fd.get("factory_address"), 300),
      booking_slots: cleanBookingSlots(fd.getAll("slot")),
      booking_consent_at: consent ? submission.booking_consent_at ?? new Date().toISOString() : null,
      supplier_note: clean(fd.get("note"), 2000),
      ...(partner ? { partner_factory_name: clean(fd.get("partner_factory_name"), 200) } : {}),
    };
    if (submit) {
      const hasContract = access.items.some((item) => item.checklist_key === "partner_factory_contract" && item.media_id && item.storage_path?.trim());
      const missing = bookingMissing({ ...submission, ...patch }, hasContract);
      if (missing.length) return { ok: false, message: copy.failed, missing: missing.map((key) => copy.missing[key]) };
      Object.assign(patch, { status: "pending_review", submitted_at: new Date().toISOString(), review_note: null });
    }
    const saved = await store.updateEditableSubmission(submission.id, patch, submission.status as "draft" | "returned");
    if (!saved) return { ok: false, message: copy.locked };
    await store.addAuditLog({
      actor_id: access.userId, actor_email: access.userEmail,
      entity: "supplier", entity_id: submission.supplier_id,
      action: submit ? "supplier.booking.submit.l2" : "supplier.booking.save.l2",
      before: { submission_id: submission.id, status: submission.status },
      after: { submission_id: submission.id, status: saved.status, method: saved.booking_method, slots: saved.booking_slots?.length ?? 0, consent: Boolean(saved.booking_consent_at) },
    }).catch((error) => console.error("[booking] audit failed", error));
    if (submit) {
      await notifyStaffSupplierSubmission(submission.supplier_id, 2, submission.l2_scope).catch(() => "failed");
      refreshCrmBadges();
    }
    revalidatePath("/supplier/portal/verification/factory");
    revalidatePath("/supplier/portal");
    revalidatePath("/crm/verifications/submissions");
    revalidatePath(`/crm/verifications/submissions/${submission.id}`);
    return { ok: true, message: submit ? copy.submitted : copy.saved };
  } catch (error) {
    console.error("[booking] save failed", error);
    return { ok: false, message: /L2_BOOKING_INCOMPLETE|L2_PARTNER_CONTRACT_REQUIRED|L2_PARTNER_NAME_REQUIRED/.test(error instanceof Error ? error.message : "")
      ? copy.failed + " " + copy.missing.contract : copy.failed };
  }
}
