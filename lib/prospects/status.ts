import type { ProspectStatus } from "@/lib/types";

export const PROSPECT_STATUSES: { value: ProspectStatus; label: string }[] = [
  { value: "new", label: "Mới nhập" },
  { value: "researched", label: "Đã rà soát" },
  { value: "ready", label: "Sẵn sàng tiếp cận" },
  { value: "contacted", label: "Đã liên hệ" },
  { value: "replied", label: "Đã phản hồi" },
  { value: "meeting", label: "Đã hẹn meeting" },
  { value: "qualified", label: "Đủ điều kiện" },
  { value: "converted", label: "Đã chuyển thành Buyer" },
  { value: "disqualified", label: "Không phù hợp" },
  { value: "unsubscribed", label: "Không liên hệ" },
];

export function prospectStatusLabel(value: string): string {
  return PROSPECT_STATUSES.find((status) => status.value === value)?.label ?? value;
}
