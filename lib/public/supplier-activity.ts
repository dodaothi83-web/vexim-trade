/**
 * Nhãn hoạt động của nhà cung cấp trên trang công khai. Chỉ hiện nhãn tích cực: "Online now" và
 * "Active today" (chủ dự án chốt 28/11/2026). Sàn còn ít nhà cung cấp và nhiều người chưa vào hằng
 * ngày; nhãn "Active this week/month" sẽ làm họ mất điểm với người mua, nên không vào trong 24 giờ thì
 * không hiện gì (trông như chưa có nhãn). Không bao giờ hiện giờ chính xác. Đây là thông tin, không
 * phải xác minh. Khi sàn đông nhà cung cấp hơn có thể thêm lại mốc tuần/tháng ở đây.
 */
export type SupplierActivity = "online" | "day";

const DAY = 24 * 60 * 60_000;
/** Bằng PRESENCE_ONLINE_MS của chat (lib/chat/presence.ts): còn thấy trong 2 phút là online. */
const ONLINE_MS = 2 * 60_000;

export function supplierActivity(lastSeenAt: string | null | undefined, nowMs = Date.now()): SupplierActivity | null {
  const seen = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  if (!Number.isFinite(seen)) return null;
  const age = Math.max(0, nowMs - seen);
  if (age < ONLINE_MS) return "online";
  if (age < DAY) return "day";
  return null;
}

export const SUPPLIER_ACTIVITY_LABELS: Record<SupplierActivity, string> = {
  online: "Online now",
  day: "Active today",
};
