"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { getSession, guard } from "@/lib/auth/session";
import { canOwnRfq } from "@/lib/rfq/assignees";
import { assertStaffMayProcessRfq } from "@/lib/rfq/staff-access";

/** Server action inline cho dropdown phân công ở trang danh sách — không redirect. */
export async function assignRfqInlineAction(fd: FormData) {
  const g = await guard("rfq.manage");
  if (g) return;
  const session = await getSession();
  const id = String(fd.get("id"));
  const to = String(fd.get("to") || "").trim();
  const store = getStore();
  // Chỉ giao cho tài khoản nội bộ đang hoạt động có quyền xử lý RFQ (không giao cho nhà cung cấp).
  if (to) {
    const target = await store.getUser(to).catch(() => null);
    if (!target || !canOwnRfq(target)) return;
  }
  const before = await assertStaffMayProcessRfq(store, id);
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
