/**
 * Tính toán cho màn quản trị gói đẩy sản phẩm.
 *
 * Hàm thuần, không đọc dữ liệu và không đọc đồng hồ bên trong, để kiểm được bằng
 * số. `scripts/check-sponsored-admin.mjs` gọi trực tiếp các hàm ở đây.
 *
 * Nguồn số liệu duy nhất cho trần bể là `docs/sponsored-listing-spec.md` mục 3:
 * danh mục 12 gói và 3 suất, trang chủ 8 gói và 2 suất. Đổi ở đặc tả thì đổi ở
 * đây, không đổi rải rác trong giao diện.
 */

export type PushSurface = "category" | "home";
export type PushStatus = "draft" | "approved" | "paused";

export interface PushLike {
  id: string;
  surface: PushSurface;
  category_slug: string;
  status: PushStatus;
  starts_at: string;
  ends_at: string;
}

/** Trần bể bán ra, theo bề mặt. */
export const POOL_CAP: Record<PushSurface, number> = { category: 12, home: 8 };

/** Số thẻ hiển thị đồng thời, theo bề mặt. */
export const POOL_SLOTS: Record<PushSurface, number> = { category: 3, home: 2 };

/** Số cửa sổ luân phiên trong một tuần: mỗi cửa sổ mười phút, đủ 168 giờ. */
export const WINDOWS_PER_WEEK = (7 * 24 * 60) / 10;

/**
 * Trạng thái nhìn từ màn quản trị.
 *
 * `pending` là gói chờ duyệt. `scheduled` là gói đã duyệt nhưng chưa tới giờ, khác
 * với `live`: gộp hai thứ này lại thì người vận hành tưởng gói đã hiện với buyer.
 */
export type PushState = "pending" | "scheduled" | "live" | "paused" | "ended";

export function pushState(push: PushLike, nowMs: number): PushState {
  const start = Date.parse(push.starts_at);
  const end = Date.parse(push.ends_at);
  if (Number.isFinite(end) && nowMs >= end) return "ended";
  if (push.status === "draft") return "pending";
  if (push.status === "paused") return "paused";
  if (Number.isFinite(start) && nowMs < start) return "scheduled";
  return "live";
}

/** Giờ còn lại, làm tròn xuống. Gói đã hết hạn trả 0. */
export function hoursLeft(push: PushLike, nowMs: number): number {
  const end = Date.parse(push.ends_at);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - nowMs) / 3_600_000));
}

/** Sắp hết hạn trong 24 giờ tới, tính cả gói đã tạm dừng vì vẫn còn hạn. */
export function expiringSoon(push: PushLike, nowMs: number): boolean {
  const state = pushState(push, nowMs);
  if (state === "ended" || state === "pending") return false;
  return hoursLeft(push, nowMs) <= 24;
}

/**
 * Gói có đang chiếm một suất trong bể hay không.
 *
 * Chỉ gói đã duyệt và đang trong khoảng thời gian của nó mới tính. Gói tạm dừng
 * không hiển thị nhưng vẫn giữ suất đã bán, nên được tính riêng ở `poolUsage`.
 */
export function occupiesSlot(push: PushLike, nowMs: number): boolean {
  return push.status === "approved" &&
    Date.parse(push.starts_at) <= nowMs && nowMs < Date.parse(push.ends_at);
}

export interface PoolRow {
  key: string;
  surface: PushSurface;
  categorySlug: string | null;
  /** Số gói đang chạy, kể cả gói đang tạm dừng nhưng còn hạn. */
  used: number;
  /** Số gói đã bán và còn hạn nhưng đang tạm dừng. */
  paused: number;
  cap: number;
  slots: number;
  /** Còn bán được thêm bao nhiêu gói. */
  free: number;
}

/**
 * Mức dùng bể theo từng bề mặt và danh mục.
 *
 * Gói tạm dừng vẫn giữ suất: nhà cung cấp đã trả tiền cho bảy ngày, tạm dừng không
 * trả suất về bể. Nếu trả suất về thì bán thêm một gói nữa là hai người cùng mua
 * một chỗ, và bật lại gói cũ sẽ vượt trần.
 */
export function poolUsage(pushes: readonly PushLike[], nowMs: number): PoolRow[] {
  const groups = new Map<string, PoolRow>();
  for (const push of pushes) {
    if (push.status === "draft") continue;
    if (nowMs >= Date.parse(push.ends_at)) continue;
    const key = push.surface === "home" ? "home" : `category:${push.category_slug}`;
    let row = groups.get(key);
    if (!row) {
      row = {
        key,
        surface: push.surface,
        categorySlug: push.surface === "home" ? null : push.category_slug,
        used: 0,
        paused: 0,
        cap: POOL_CAP[push.surface],
        slots: POOL_SLOTS[push.surface],
        free: POOL_CAP[push.surface],
      };
      groups.set(key, row);
    }
    if (push.status === "paused") row.paused += 1;
    else if (occupiesSlot(push, nowMs)) row.used += 1;
  }
  for (const row of groups.values()) {
    row.used += row.paused;
    row.free = Math.max(0, row.cap - row.used);
  }
  return [...groups.values()].sort((a, b) =>
    a.surface === b.surface
      ? (a.categorySlug ?? "").localeCompare(b.categorySlug ?? "")
      : a.surface === "category" ? -1 : 1);
}

/**
 * Số lượt hiển thị một gói nhận được mỗi tuần khi bể có `used` gói.
 *
 * Mỗi cửa sổ mười phút lấy tối đa `slots` thẻ, và một gói không thể hiện hai lần
 * trong cùng một cửa sổ. Vì vậy bể ít gói thì mỗi gói nhận nhiều hơn, và khi bể
 * chỉ có một gói thì trần là số suất chứ không phải số cửa sổ nhân số suất.
 */
export function weeklyImpressions(used: number, surface: PushSurface): number {
  const slots = POOL_SLOTS[surface];
  if (used <= 0) return 0;
  return Math.round((WINDOWS_PER_WEEK * Math.min(slots, used)) / used);
}

export interface DailyRow {
  push_id: string;
  day: string;
  event_type: "impression" | "click";
  events: number;
}

export interface Totals {
  impressions: number;
  clicks: number;
}

/** Cộng dồn số liệu theo gói, chỉ lấy các ngày nằm trong cửa sổ báo cáo. */
export function totalsByPush(rows: readonly DailyRow[], sinceDay?: string): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const row of rows) {
    if (sinceDay && row.day < sinceDay) continue;
    const current = out.get(row.push_id) ?? { impressions: 0, clicks: 0 };
    if (row.event_type === "impression") current.impressions += row.events;
    else current.clicks += row.events;
    out.set(row.push_id, current);
  }
  return out;
}

/** Ngày UTC của `days` ngày trước, dùng cho mốc "bảy ngày gần nhất". */
export function dayKeyDaysAgo(nowMs: number, days: number): string {
  return new Date(nowMs - days * 86_400_000).toISOString().slice(0, 10);
}

export interface Summary {
  live: number;
  pending: number;
  impressions7d: number;
  clicks7d: number;
  expiring: number;
}

export function summarize(pushes: readonly PushLike[], totals: Map<string, Totals>, nowMs: number): Summary {
  let live = 0;
  let pending = 0;
  let expiring = 0;
  let impressions = 0;
  let clicks = 0;
  for (const push of pushes) {
    const state = pushState(push, nowMs);
    if (state === "live") live += 1;
    if (state === "pending") pending += 1;
    if (expiringSoon(push, nowMs)) expiring += 1;
    const t = totals.get(push.id);
    if (t && (state === "live" || state === "ended" || state === "paused" || state === "scheduled")) {
      impressions += t.impressions;
      clicks += t.clicks;
    }
  }
  return { live, pending, impressions7d: impressions, clicks7d: clicks, expiring };
}

/** Tỷ lệ mở thẻ trên số lượt hiển thị, làm tròn một chữ số thập phân. */
export function clickRate(clicks: number, impressions: number): number {
  if (impressions <= 0) return 0;
  return Math.round((clicks / impressions) * 1000) / 10;
}

/**
 * Các gói đã duyệt chồng lấn khoảng thời gian với một gói mới, cùng bề mặt và
 * cùng danh mục. Đây đúng tập mà ràng buộc trong cơ sở dữ liệu đếm để chặn vượt
 * trần, nên kiểm ở đây cho khớp thay vì kiểm theo "đang chạy lúc này".
 */
export function overlapping(pushes: readonly PushLike[], candidate: Pick<PushLike, "surface" | "category_slug" | "starts_at" | "ends_at">): PushLike[] {
  const from = Date.parse(candidate.starts_at);
  const to = Date.parse(candidate.ends_at);
  return pushes.filter((push) => {
    if (push.status !== "approved") return false;
    if (push.surface !== candidate.surface) return false;
    if (candidate.surface === "category" && push.category_slug !== candidate.category_slug) return false;
    return Date.parse(push.starts_at) < to && from < Date.parse(push.ends_at);
  });
}

/** Thông báo khi bể đã đầy, dùng chung cho biểu mẫu và thông báo lỗi. */
export function poolFullMessage(surface: PushSurface, categoryName: string): string {
  return surface === "home"
    ? `Bể trang chủ đã đủ ${POOL_CAP.home} gói trong khoảng thời gian này.`
    : `Bể ${categoryName} đã đủ ${POOL_CAP.category} gói trong khoảng thời gian này.`;
}
