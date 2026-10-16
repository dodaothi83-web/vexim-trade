"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { notifyBuyerRfqStatus } from "@/lib/rfq/buyer-notify";

/** Server action inline cho dropdown phân công ở trang danh sách — không redirect. */
export async function assignRfqInlineAction(fd: FormData) {
  const g = await guard("rfq.manage");
  if (g) return;
  const session = await getSession();
  const id = String(fd.get("id"));
  const to = String(fd.get("to") || "").trim();
  const store = getStore();
  const before = await store.getRfq(id);
  const after = await store.updateRfq(id, {
    assigned_to: to || null,
    // Auto chuyển new/needs_review → in_progress khi có người nhận (giữ nguyên các trạng thái sau đó).
    ...(before && (before.status === "new" || before.status === "needs_review") ? { status: "in_progress" } : {}),
  });
  try {
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "rfq",
      entity_id: id,
      action: to ? "assign" : "unassign",
      before: before ? { assigned_to: before.assigned_to, status: before.status } : null,
      after: { assigned_to: after.assigned_to, status: after.status },
    });
  } catch { /* audit lỗi không chặn phân công */ }
  revalidatePath("/crm/rfqs");
  revalidatePath(`/crm/rfqs/${id}`);
}

/** Server action inline cho chuyển trạng thái (nút trong trang chi tiết). */
export async function setRfqStatusAction(fd: FormData) {
  const g = await guard("rfq.manage");
  if (g) return { ok: false, message: "Không có quyền." };
  const session = await getSession();
  const id = String(fd.get("id"));
  const status = String(fd.get("status") || "");
  const lostReason = String(fd.get("lost_reason") || "").trim();
  const store = getStore();
  const before = await store.getRfq(id);
  if (!before) return { ok: false, message: "RFQ không tồn tại." };
  const patch: Record<string, unknown> = { status };
  if (status === "lost") {
    if (!lostReason) return { ok: false, message: "Bắt buộc chọn lý do khi đóng lost." };
    patch.lost_reason = lostReason;
  }
  if (status === "quoted") patch.first_response_at = before.first_response_at ?? new Date().toISOString();
  try {
    const after = await store.updateRfq(id, patch);
    await store.addAuditLog({
      actor_id: session?.uid ?? null,
      actor_email: session?.email ?? null,
      entity: "rfq",
      entity_id: id,
      action: `status.${status}`,
      before: { status: before.status, lost_reason: before.lost_reason },
      after: { status: after.status, lost_reason: after.lost_reason },
    });
    revalidatePath("/crm/rfqs");
    revalidatePath(`/crm/rfqs/${id}`);
    if (status === "sampling" || status === "lost") {
      const notified = await notifyBuyerRfqStatus(after, status);
      if (!notified.sent && !["already_sent", "pending"].includes(notified.reason ?? "")) {
        return { ok: false, message: "Đã lưu trạng thái nhưng chưa gửi được thông báo buyer. Hãy thử lại." };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Lỗi" };
  }
}
