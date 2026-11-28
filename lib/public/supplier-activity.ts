/**
 * Nhãn "truy cập lần cuối" của nhà cung cấp trên trang công khai (chủ dự án duyệt 28/11/2026).
 * Chỉ hiện theo mốc, không hiện giờ chính xác. Quá 30 ngày thì ẩn hẳn (không ghi "3 tháng trước"
 * cho bất lợi nhà cung cấp); CRM vẫn thấy đủ. Đây là thông tin, không phải xác minh.
 */
export type SupplierActivity = "online" | "day" | "week" | "month";

const DAY = 24 * 60 * 60_000;
/** Bằng PRESENCE_ONLINE_MS của chat (lib/chat/presence.ts): còn thấy trong 2 phút là online. */
const ONLINE_MS = 2 * 60_000;

export function supplierActivity(lastSeenAt: string | null | undefined, nowMs = Date.now()): SupplierActivity | null {
  const seen = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  if (!Number.isFinite(seen)) return null;
  const age = Math.max(0, nowMs - seen);
  if (age < ONLINE_MS) return "online";
  if (age < DAY) return "day";
  if (age < 7 * DAY) return "week";
  if (age < 30 * DAY) return "month";
  return null;
}

export const SUPPLIER_ACTIVITY_LABELS: Record<SupplierActivity, string> = {
  online: "Online now",
  day: "Active today",
  week: "Active this week",
  month: "Active this month",
};
