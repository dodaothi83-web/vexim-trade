"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import { refreshCrmBadges } from "@/lib/crm/badges";
import { EXPORT_REVIEW_QUESTIONS, exportPublicSummary } from "@/lib/crm/export-review";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";
import { staffSubmissionAccess } from "@/lib/supplier-portal/submission-access";
import { acceptSubmissionIntoVerification, returnSubmission } from "@/lib/verification-submission-service";
import { canSelfApproveVerification } from "@/lib/verification-policy";
import type { Verification } from "@/lib/types";
import { approveVerificationAction, returnVerificationAction } from "../suppliers/[slug]/verification-actions";

/**
 * Xét nhanh chứng từ xuất khẩu (cấp L2 hiển thị, mã target_level = 3) trong một trang.
 *
 * Hai nút thay cho cả chuỗi "nhận vào đợt kiểm → đánh dấu từng tệp → nộp duyệt → tự xác nhận →
 * viết tóm tắt → duyệt". Mọi luật duyệt cũ vẫn chạy: hàm này chỉ gọi lại đúng các bước có sẵn
 * (nhận hồ sơ, nộp, `approveVerificationAction`, `returnVerificationAction`), nên quyền duyệt,
 * trigger CSDL, nhật ký và email giữ nguyên.
 */
type Result = { ok: boolean; message: string };
const OPEN_STATUSES = new Set(["in_progress", "scheduled", "submitted"]);

function refresh(supplierId: string) {
  revalidatePath("/crm/tasks");
  revalidatePath("/crm/verifications");
  revalidatePath("/crm/verifications/submissions");
  revalidatePath(`/crm/suppliers/${supplierId}`);
  revalidatePath("/supplier/portal/verification/export");
  refreshCrmBadges();
}

async function decider(): Promise<{ uid: string; email: string | null } | string> {
  const session = await getSession();
  if (!session) return "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.";
  if (!canSelfApproveVerification(session.role) || !hasPermission(session.role, "media.internal")) {
    return "Chỉ quản trị viên hoặc trưởng kiểm duyệt được bấm Duyệt hoặc Trả lại.";
  }
  return { uid: session.uid, email: session.email };
}

/** Lấy đợt kiểm cần quyết định; hồ sơ tự gửi còn chờ thì nhận vào đợt kiểm trước. */
async function openReview(kind: string, id: string, staff: { uid: string; email: string | null }): Promise<Verification | string> {
  const store = getStore();
  if (kind === "submission") {
    const access = await staffSubmissionAccess(id);
    if (!access || access.submission.target_level !== 3) return "Không tìm thấy hồ sơ chứng từ xuất khẩu này.";
    if (access.submission.status !== "pending_review") return "Hồ sơ này đã được xử lý. Tải lại trang Việc cần làm.";
    const { verification } = await acceptSubmissionIntoVerification(access.store, {
      bundle: { submission: access.submission, items: access.items, links: access.links },
      staffId: staff.uid, staffEmail: staff.email, note: "Xét nhanh trên trang Việc cần làm.",
    });
    return verification;
  }
  const verification = await store.getVerification(id);
  if (!verification || verification.target_level !== 3) return "Không tìm thấy đợt kiểm chứng từ xuất khẩu này.";
  if (!OPEN_STATUSES.has(verification.status)) return "Đợt kiểm này đã được xử lý. Tải lại trang Việc cần làm.";
  return verification;
}

/** Đưa đợt kiểm sang "đã nộp" để dùng đúng bước duyệt/trả có sẵn. */
async function markSubmitted(verification: Verification, note: string) {
  if (verification.status === "submitted") return;
  await getStore().updateVerification(verification.id, {
    status: "submitted", return_reason: null,
    internal_notes: [verification.internal_notes, note].filter(Boolean).join("\n").slice(0, 5000),
  });
}

export async function quickApproveExportAction(fd: FormData): Promise<Result> {
  try {
    const staff = await decider();
    if (typeof staff === "string") return { ok: false, message: staff };
    const unanswered = EXPORT_REVIEW_QUESTIONS.filter((q) => fd.get(`q:${q.key}`) !== "yes");
    if (unanswered.length) return { ok: false, message: "Chỉ duyệt khi cả ba câu đều là Có. Nếu có câu Không, hãy bấm Trả lại và chọn lý do." };

    const verification = await openReview(String(fd.get("kind") ?? ""), String(fd.get("id") ?? ""), staff);
    if (typeof verification === "string") return { ok: false, message: verification };
    const store = getStore();

    // Người duyệt đã mở và xem từng tệp: ghi nhận "đã kiểm" thay cho việc bấm từng nút.
    const media = (await store.listMedia("verification", verification.id))
      .filter((m) => m.storage_path && ["image", "document", "certificate"].includes(m.kind));
    if (!media.length) return { ok: false, message: "Hồ sơ chưa có tệp chứng từ nào. Bấm Trả lại để nhà cung cấp tải bổ sung." };
    for (const asset of media) if (asset.status !== "checked") await store.updateMedia(asset.id, { status: "checked" });

    await markSubmitted(verification, "Xét nhanh: người duyệt trả lời Có cho cả ba câu (tên công ty, ngày và nước nhận hàng, chứng từ rõ ràng).");
    await store.addAuditLog({
      actor_id: staff.uid, actor_email: staff.email, entity: "supplier", entity_id: verification.supplier_id,
      action: "verification.quick_review.l3",
      before: { id: verification.id, status: verification.status },
      after: { id: verification.id, answers: Object.fromEntries(EXPORT_REVIEW_QUESTIONS.map((q) => [q.key, true])), files_checked: media.length },
    }).catch((error) => console.error("[quick-review] audit log failed", error));

    const decision = new FormData();
    decision.set("id", verification.id);
    decision.set("confirm_evidence_review", "yes");
    decision.set("confirm_self_review", "yes");
    decision.set("public_summary", exportPublicSummary({ destination: verification.shipment_destination, shippedOn: verification.shipped_on }));
    decision.set("confirm_public_summary", "yes");
    const result = await approveVerificationAction(decision);
    refresh(verification.supplier_id);
    return result.ok
      ? { ok: true, message: "Đã duyệt. Nhà cung cấp được báo qua email và người mua thấy kết quả trên hồ sơ." }
      : { ok: false, message: `${result.message} Hồ sơ vẫn đang chờ duyệt.` };
  } catch (error) {
    console.error("[quick-review] approve failed", error);
    return { ok: false, message: "Chưa duyệt được. Tải lại trang và thử lại; nếu vẫn lỗi, báo người phụ trách kỹ thuật." };
  }
}

export async function quickReturnExportAction(fd: FormData): Promise<Result> {
  try {
    const staff = await decider();
    if (typeof staff === "string") return { ok: false, message: staff };
    const reason = String(fd.get("reason") ?? "").trim();
    if (reason.length < 8) return { ok: false, message: "Chọn hoặc ghi lý do trả lại để nhà cung cấp biết cần sửa gì." };
    const kind = String(fd.get("kind") ?? "");
    const id = String(fd.get("id") ?? "");
    const store = getStore();

    if (kind === "submission") {
      const access = await staffSubmissionAccess(id);
      if (!access || access.submission.target_level !== 3) return { ok: false, message: "Không tìm thấy hồ sơ chứng từ xuất khẩu này." };
      if (access.submission.status !== "pending_review") return { ok: false, message: "Hồ sơ này đã được xử lý. Tải lại trang Việc cần làm." };
      await returnSubmission(store, { submission: access.submission, staffId: staff.uid, staffEmail: staff.email, reason });
      await notifySupplierDecision({ supplierId: access.submission.supplier_id, decision: "verification_returned", name: "Lịch sử giao hàng", note: reason })
        .catch((error) => console.error("[quick-review] return email failed", error));
      refresh(access.submission.supplier_id);
      return { ok: true, message: "Đã trả lại kèm lý do. Nhà cung cấp sẽ sửa trong cổng rồi gửi lại." };
    }

    const verification = await store.getVerification(id);
    if (!verification || verification.target_level !== 3 || !OPEN_STATUSES.has(verification.status)) {
      return { ok: false, message: "Đợt kiểm này đã được xử lý. Tải lại trang Việc cần làm." };
    }
    await markSubmitted(verification, "Xét nhanh: người duyệt trả lại hồ sơ.");
    const decision = new FormData();
    decision.set("id", verification.id);
    decision.set("reason", reason);
    const result = await returnVerificationAction(decision);
    if (!result.ok) return result;
    // Mở lại hồ sơ tự gửi gốc để nhà cung cấp sửa và gửi lại trong cổng.
    const linked = (await store.listSubmissions(verification.supplier_id, 3)).find((s) => s.verification_id === verification.id);
    if (linked) await store.updateSubmission(linked.id, { status: "returned", reviewed_by: staff.uid, reviewed_at: new Date().toISOString(), review_note: reason.slice(0, 1900) });
    refresh(verification.supplier_id);
    return { ok: true, message: "Đã trả lại kèm lý do. Nhà cung cấp sẽ sửa trong cổng rồi gửi lại." };
  } catch (error) {
    console.error("[quick-review] return failed", error);
    return { ok: false, message: "Chưa trả lại được. Tải lại trang và thử lại; nếu vẫn lỗi, báo người phụ trách kỹ thuật." };
  }
}
