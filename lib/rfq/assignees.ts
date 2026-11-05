import { hasPermission } from "@/lib/auth/permissions";
import type { AppUser } from "@/lib/types";

export type RfqAssignee = { id: string; label: string };

/** Ai được nhận RFQ: tài khoản nội bộ đang hoạt động và có quyền xử lý RFQ. Không gồm tài khoản nhà cung cấp. */
export function canOwnRfq(user: Pick<AppUser, "role" | "is_active">): boolean {
  return user.is_active && user.role !== "supplier" && hasPermission(user.role, "rfq.manage");
}

/** Tên hiển thị: tên rỗng thì dùng email, tránh dòng trống trong danh sách. */
export function assigneeLabel(user: Pick<AppUser, "name" | "email">): string {
  return user.name?.trim() || user.email;
}

/**
 * Danh sách chủ trì cho ô phân công, sắp theo tên. Người đang được giao nhưng không còn
 * đủ điều kiện vẫn được giữ ở đầu danh sách để không âm thầm mất phân công cũ.
 */
export function rfqAssigneeOptions(users: AppUser[], assignedTo?: string | null): RfqAssignee[] {
  const options = users.filter(canOwnRfq)
    .map((u) => ({ id: u.id, label: assigneeLabel(u) }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
  const current = assignedTo ? users.find((u) => u.id === assignedTo) : null;
  if (current && !canOwnRfq(current)) options.unshift({ id: current.id, label: `${assigneeLabel(current)} (không còn quyền)` });
  return options;
}
