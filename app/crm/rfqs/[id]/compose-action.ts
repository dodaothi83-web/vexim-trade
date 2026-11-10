"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { notifyBuyerRfqStatus } from "@/lib/rfq/buyer-notify";
import { notifySelectedSupplier, recordSupplierSelection } from "@/lib/rfq/outreach";
import { CLOSED_RFQ_STATUSES, SELECTABLE_MATCH_STATUSES, isSupplierQuestionRfq } from "@/lib/rfq/workflow";
import { assertStaffMayProcessRfq } from "@/lib/rfq/staff-access";
import { rfqChannel } from "@/lib/rfq/channel";

/** Legacy action endpoint: RFQ follow-ups now belong in the authenticated Vexim desk. */
export async function composeMatchEmailAction(_fd: FormData): Promise<void> {
  throw new Error("Email không còn là kênh giao dịch RFQ. Dùng mạch trao đổi trong cổng Vexim.");
}

/** Chuyển RFQ sang sampling (bắt đầu gửi mẫu). */
export async function markSamplingAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
  const rfqId = String(fd.get("rfq_id") || "").trim();
  const selectedMatchId = String(fd.get("selected_match_id") || "").trim();
  if (!rfqId) throw new Error("Thiếu RFQ.");
  const store = getStore();
  const before = await assertStaffMayProcessRfq(store, rfqId);
  if (rfqChannel(before) !== "sourcing") throw new Error("Chỉ Vexim xử lý RFQ tìm nguồn.");
  // Gửi mẫu đứng trước chốt đơn: không kéo RFQ đã đóng quay lại sampling.
  if (CLOSED_RFQ_STATUSES.includes(before.status)) throw new Error("RFQ đã đóng; không thể chuyển sang gửi mẫu.");
  if (isSupplierQuestionRfq(before)) throw new Error("Câu hỏi trực tiếp cho nhà cung cấp không có bước gửi mẫu.");
  if (before.status !== "sampling" && !selectedMatchId) throw new Error("Chọn nhà cung cấp có báo giá để gửi mẫu.");
  if (selectedMatchId) {
    const m = await store.getRfqMatch(selectedMatchId);
    if (!m || m.rfq_id !== rfqId) throw new Error("Nhà cung cấp đã chọn không thuộc RFQ này.");
    if (!m.sent_to_buyer_at || !SELECTABLE_MATCH_STATUSES.includes(m.status) ||
        !(await store.listRfqQuoteVersions([m.id])).some((v) => v.match_id === m.id)) {
      throw new Error("Chỉ gửi mẫu với nhà cung cấp có báo giá đã công bố trong tài khoản người mua.");
    }
    if (before.status !== "sampling" && m.status !== "selected") {
      // Cùng một quy tắc với nút "Chọn nhà cung cấp": có Introduction bảo hộ 12 tháng
      // và các NCC còn lại chuyển not_selected.
      await recordSupplierSelection(before, m);
      const actor = await getSession();
      const email = await notifySelectedSupplier(before, m, actor?.uid ?? "");
      if (email === "failed") console.warn("[rfq] supplier selection during sampling saved without email");
    }
  }
  const rfq = before.status === "sampling" ? before : await store.updateRfq(rfqId, { status: "sampling" });
  if (before.status !== "sampling") {
    const actor = await getSession();
    await store.addAuditLog({
      actor_id: actor?.uid ?? null, actor_email: actor?.email ?? null,
      entity: "rfq", entity_id: rfqId, action: "status.sampling",
      before: { status: before.status }, after: { status: rfq.status, selected_match_id: selectedMatchId || null },
    }).catch((err) => console.error("[rfq] không ghi được audit sampling:", err));
  }
  // Chỉ một email cho mỗi giai đoạn. Nếu gửi thất bại, submit lại nút này để thử lại.
  const notified = await notifyBuyerRfqStatus(rfq, "sampling", selectedMatchId || null);
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${rfqId}`);
  if (!notified.sent && notified.reason !== "already_sent" && notified.reason !== "pending") {
    throw new Error("Đã lưu trạng thái sampling nhưng chưa gửi được thông báo cho người mua. Hãy thử lại.");
  }
}

/** Đóng RFQ lost (bắt buộc lý do). */
export async function markLostAction(fd: FormData): Promise<void> {
  const g = await guard("rfq.manage");
  if (g) redirect("/crm/dashboard");
  const rfqId = String(fd.get("rfq_id") || "").trim();
  const reason = String(fd.get("lost_reason") || "").trim();
  const note = String(fd.get("note") || "").trim();
  if (!rfqId) throw new Error("Thiếu RFQ.");
  if (!reason) throw new Error("Bắt buộc chọn lý do mất đơn.");
  const store = getStore();
  const before = await assertStaffMayProcessRfq(store, rfqId);
  if (rfqChannel(before) !== "sourcing") throw new Error("Chỉ Vexim xử lý RFQ tìm nguồn.");
  const rfq = before.status === "lost" ? before : await store.updateRfq(rfqId, {
    status: "lost",
    lost_reason: reason,
    closed_reason: note || null,
  });
  if (before.status !== "lost") {
    const actor = await getSession();
    await store.addAuditLog({
      actor_id: actor?.uid ?? null, actor_email: actor?.email ?? null,
      entity: "rfq", entity_id: rfqId, action: "status.lost",
      before: { status: before.status }, after: { status: rfq.status, lost_reason: rfq.lost_reason },
    }).catch((err) => console.error("[rfq] không ghi được audit lost:", err));
  }
  const notified = await notifyBuyerRfqStatus(rfq, "lost");
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${rfqId}`);
  if (!notified.sent && notified.reason !== "already_sent" && notified.reason !== "pending") {
    throw new Error("Đã lưu trạng thái lost nhưng chưa gửi được thông báo cho người mua. Hãy thử lại.");
  }
}

/** Legacy action endpoint: fail closed, including forged form submissions. */
export async function sendFollowUpAction(_fd: FormData): Promise<void> {
  throw new Error("Nhắc nhà cung cấp qua mạch trao đổi trong cổng, không gửi RFQ qua email.");
}
