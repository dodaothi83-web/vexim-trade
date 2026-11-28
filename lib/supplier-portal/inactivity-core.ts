/**
 * Nhà cung cấp lâu không vào cổng (chủ dự án duyệt 28/11/2026). Phần thuần, không đọc ghi gì:
 * số ngày chưa vào (CRM), và khi nào gửi thư nhắc.
 *
 * "Lần cuối thấy" là mốc chat presence: mỗi lần nhà cung cấp mở cổng hoặc chat đều được ghi.
 * Nhà cung cấp chưa từng có mốc thì không tính (không đoán), không gửi thư.
 *
 * Lịch thư nhắc cho một đợt vắng mặt: thư 1 khi đủ 5 ngày, thư 2 khi đủ 14 ngày, rồi thôi.
 * Nhà cung cấp quay lại (mốc mới sau thư nhắc gần nhất) thì bắt đầu đợt mới.
 */
export const INACTIVITY_REMINDER_DAYS = [5, 14] as const;
/** Hai thư vắng mặt cách nhau ít nhất chừng này ngày (kể cả khi đã vắng lâu từ trước). */
export const INACTIVITY_MIN_GAP_DAYS = 7;
/** Không gửi thư vắng mặt sát ngay sau một thư nhắc hoàn thiện hồ sơ. */
export const INACTIVITY_GAP_AFTER_OTHER_REMINDER_DAYS = 3;

const DAY = 86_400_000;

export function daysSinceSeen(lastSeenAt: string | null | undefined, nowMs = Date.now()): number | null {
  const seen = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  if (!Number.isFinite(seen)) return null;
  return Math.max(0, Math.floor((nowMs - seen) / DAY));
}

/** Chữ cho CRM: "Hôm nay", "Hôm qua", "6 ngày chưa vào", "Chưa vào lần nào". */
export function lastSeenText(days: number | null): string {
  if (days === null) return "Chưa vào lần nào";
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  return `${days} ngày chưa vào`;
}

/** Dạng câu cho dòng phụ: "hôm nay", "hôm qua", "6 ngày trước", "chưa vào lần nào". */
export function lastSeenAgo(days: number | null): string {
  if (days === null) return "chưa vào lần nào";
  if (days === 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  return `${days} ngày trước`;
}

/** Màu nhắc nhân viên: từ 7 ngày là vàng, từ 30 ngày là đỏ. */
export function lastSeenTone(days: number | null): "ok" | "warn" | "bad" {
  if (days === null || days >= 30) return "bad";
  return days >= 7 ? "warn" : "ok";
}

/**
 * Thư nhắc thứ mấy cần gửi bây giờ (0 là thư 5 ngày, 1 là thư 14 ngày), hoặc null.
 * `sentAt` là các lần đã gửi thư vắng mặt; chỉ tính thư gửi sau lần cuối nhà cung cấp vào.
 * `otherReminderAt` là thư nhắc hoàn thiện hồ sơ gần nhất, để không dồn hai thư sát nhau.
 */
export function inactivityReminderDue(input: {
  lastSeenAt: string | null | undefined;
  sentAt: readonly string[];
  otherReminderAt?: string | null;
  nowMs?: number;
}): number | null {
  const now = input.nowMs ?? Date.now();
  const seen = input.lastSeenAt ? Date.parse(input.lastSeenAt) : NaN;
  if (!Number.isFinite(seen)) return null;
  const days = Math.floor((now - seen) / DAY);
  const thisRound = input.sentAt.map((at) => Date.parse(at)).filter((at) => Number.isFinite(at) && at > seen);
  const sentThisRound = thisRound.length;
  if (sentThisRound >= INACTIVITY_REMINDER_DAYS.length) return null;
  if (days < INACTIVITY_REMINDER_DAYS[sentThisRound]) return null;
  if (sentThisRound > 0 && now - Math.max(...thisRound) < INACTIVITY_MIN_GAP_DAYS * DAY) return null;
  const other = input.otherReminderAt ? Date.parse(input.otherReminderAt) : NaN;
  if (Number.isFinite(other) && now - other < INACTIVITY_GAP_AFTER_OTHER_REMINDER_DAYS * DAY) return null;
  return sentThisRound;
}

/**
 * Thứ Hai (giờ Việt Nam) nhà cung cấp đã nhận email báo cáo tuần (weekly-report.ts, REPORT_WEEKDAY = 1):
 * không gửi thêm thư vắng mặt hôm đó, để mỗi ngày tối đa một thư tự động.
 */
export function inactivityRunsToday(nowMs = Date.now()): boolean {
  return new Date(nowMs + 7 * 3_600_000).getUTCDay() !== 1;
}
