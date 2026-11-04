import type { SourcingStatus } from "@/lib/types";
export const sourcingStatuses: SourcingStatus[] = ["new", "in_progress", "needs_info", "closed"];
export function sourcingStatusLabel(status: SourcingStatus, vi: boolean) {
  return { new: vi ? "Đã nhận" : "Received", in_progress: vi ? "Đang xử lý" : "In progress", needs_info: vi ? "Cần bổ sung thông tin" : "Needs information", closed: vi ? "Đã kết thúc" : "Closed" }[status];
}

/** CRM work state, distinct from the buyer-facing acknowledgement “Received”. */
export function sourcingCrmStatusLabel(status: SourcingStatus) {
  return status === "new" ? "Mới — chưa tiếp nhận" : sourcingStatusLabel(status, true);
}
