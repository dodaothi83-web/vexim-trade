/**
 * Mốc nhắc gia hạn gói trả phí. Tệp thuần (không import) để script kiểm tra nạp thẳng.
 *
 * - "d30": còn 8–30 ngày.  - "d7": còn 0–7 ngày.  - "expired": đã hết hạn trong 14 ngày gần nhất.
 * Chỉ trả mốc cao nhất đang áp dụng, nên lần chạy đầu không gửi dồn cả "d30" lẫn "d7".
 * Gói đã hết hạn quá 14 ngày thì không gửi gì, tránh báo tin cũ khi mới bật tính năng.
 */
export type PlanReminderKind = "d30" | "d7" | "expired";

const DAY = 86_400_000;
export const PLAN_EXPIRING_DAYS = 30;

export function planReminderKind(expiresAt: string | null | undefined, now: number): PlanReminderKind | null {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  if (end <= now) return now - end <= 14 * DAY ? "expired" : null;
  const daysLeft = Math.ceil((end - now) / DAY);
  if (daysLeft <= 7) return "d7";
  if (daysLeft <= PLAN_EXPIRING_DAYS) return "d30";
  return null;
}

/** Số ngày còn lại (làm tròn lên), dùng trong tiêu đề thư. */
export function planDaysLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / DAY));
}
