import type { HarvestCalendar, HarvestSource, HarvestWindow } from "@/lib/types";

/**
 * Lịch mùa vụ: phần logic thuần, không phụ thuộc React.
 *
 * Tách khỏi giao diện để kiểm thử được bằng Node, và để sau này trang market
 * dùng lại đúng một cách tính thay vì viết lại.
 */

export const HARVEST_MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const HARVEST_MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Cao điểm thu hoạch, đang trong vụ, hoặc ngoài vụ. */
export type HarvestMonthState = "peak" | "harvest" | "none";

function isMonth(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12;
}

/** Danh sách tháng (1 đến 12) mà một cửa sổ bao phủ. Tự xử lý trường hợp vắt qua năm mới. */
export function monthsCovered(window: Pick<HarvestWindow, "start_month" | "end_month">): number[] {
  const start = window.start_month;
  const end = window.end_month;
  if (!isMonth(start) || !isMonth(end)) return [];
  if (start <= end) {
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  // Ví dụ 11 đến 1 nghĩa là tháng 11, 12, 1.
  return [...Array.from({ length: 13 - start }, (_, i) => start + i), ...Array.from({ length: end }, (_, i) => i + 1)];
}

/** Trạng thái 12 tháng, luôn đủ 12 phần tử. Cao điểm thắng khi các cửa sổ chồng nhau. */
export function buildMonthStates(windows: HarvestWindow[] | null | undefined): HarvestMonthState[] {
  const states: HarvestMonthState[] = Array.from({ length: 12 }, () => "none");
  for (const window of Array.isArray(windows) ? windows : []) {
    for (const month of monthsCovered(window)) {
      if (window.peak) states[month - 1] = "peak";
      else if (states[month - 1] === "none") states[month - 1] = "harvest";
    }
  }
  return states;
}

/** Categorical activity levels, not crop volume or a continuous market metric. */
export const HARVEST_ACTIVITY_LEVELS: ReadonlyArray<{ state: HarvestMonthState; label: string; level: number }> = [
  { state: "peak", label: "Main harvest", level: 2 },
  { state: "harvest", label: "In season", level: 1 },
  { state: "none", label: "Outside the season", level: 0 },
];

export const HARVEST_CHART_FRAME = {
  width: 840, height: 250, left: 118, right: 816, top: 36, bottom: 176,
} as const;

export interface HarvestChartPoint {
  month: number;
  state: HarvestMonthState;
  label: string;
  x: number;
  y: number;
}

/**
 * Map the twelve real month states to a smooth SVG curve. Horizontal tangents
 * keep every segment between its two observed levels, so smoothing cannot
 * invent a higher peak or a lower trough.
 */
export function buildHarvestChartGeometry(states: readonly HarvestMonthState[]) {
  const frame = HARVEST_CHART_FRAME;
  const ticks = HARVEST_ACTIVITY_LEVELS.map((item) => ({
    ...item,
    y: frame.bottom - (item.level / 2) * (frame.bottom - frame.top),
  }));
  const points: HarvestChartPoint[] = Array.from({ length: 12 }, (_, index) => {
    const state = states[index] ?? "none";
    const activity = ticks.find((item) => item.state === state)!;
    return {
      month: index + 1,
      state,
      label: activity.label,
      x: Number((frame.left + (index * (frame.right - frame.left)) / 11).toFixed(2)),
      y: activity.y,
    };
  });
  const path = smoothHarvestPath(points);
  const areaPath = points.length
    ? `${path} L ${points.at(-1)!.x} ${frame.bottom} L ${points[0].x} ${frame.bottom} Z`
    : "";
  return { ...frame, ticks, points, path, areaPath };
}

function smoothHarvestPath(points: readonly HarvestChartPoint[]): string {
  if (points.length === 0) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const midpoint = Number(((from.x + to.x) / 2).toFixed(2));
    path += ` C ${midpoint} ${from.y}, ${midpoint} ${to.y}, ${to.x} ${to.y}`;
  }
  return path;
}

/** Sắp theo tháng bắt đầu để biểu đồ và danh sách đọc theo thứ tự thời gian. */
export function sortHarvestWindows(windows: HarvestWindow[] | null | undefined): HarvestWindow[] {
  return (Array.isArray(windows) ? windows : [])
    .filter((w) => w && typeof w.label === "string" && isMonth(w.start_month) && isMonth(w.end_month))
    .slice()
    .sort((a, b) => a.start_month - b.start_month);
}

function monthName(month: number): string {
  return HARVEST_MONTH_FULL[month - 1] ?? "";
}

/** Mô tả một cửa sổ: "February to May". Cửa sổ một tháng ghi "March". */
export function windowRangeText(window: Pick<HarvestWindow, "start_month" | "end_month">): string {
  if (window.start_month === window.end_month) return monthName(window.start_month);
  return `${monthName(window.start_month)} to ${monthName(window.end_month)}`;
}

/**
 * Câu tóm tắt cho trình đọc màn hình và cho phần chú thích.
 * Ví dụ: "February to May, then November to January".
 */
export function harvestHeadline(windows: HarvestWindow[] | null | undefined): string {
  const sorted = sortHarvestWindows(windows);
  if (sorted.length === 0) return "";
  const states = buildMonthStates(sorted);
  if (states.every((s) => s !== "none")) return "Harvested all year";
  const parts = sorted.map((w) => windowRangeText(w));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, then ${parts[parts.length - 1]}`;
}

/** Một dòng mô tả đủ để đọc thành tiếng: nhãn, khoảng tháng, vùng, ghi chú. */
export function windowDescription(window: HarvestWindow): string {
  const bits = [window.label?.trim() || "Harvest", windowRangeText(window)];
  if (Array.isArray(window.regions) && window.regions.length > 0) bits.push(window.regions.join(", "));
  if (window.note?.trim()) bits.push(window.note.trim());
  return bits.join(". ");
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWindow(raw: unknown, index: number): HarvestWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const start = Number(record.start_month);
  const end = Number(record.end_month);
  if (!isMonth(start) || !isMonth(end)) return null;
  const label = asText(record.label) || `Window ${index + 1}`;
  const regions = Array.isArray(record.regions)
    ? record.regions.map(asText).filter(Boolean)
    : asText(record.regions)
      ? asText(record.regions).split(",").map((r) => r.trim()).filter(Boolean)
      : [];
  return {
    id: asText(record.id) || `w${index + 1}`,
    label,
    start_month: start,
    end_month: end,
    regions,
    peak: record.peak === true,
    note: asText(record.note) || undefined,
  };
}

function normalizeSources(raw: unknown): HarvestSource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const sources: HarvestSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    try {
      const url = new URL(asText(record.url));
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) continue;
      url.hash = "";
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      sources.push({ url: url.href, title: asText(record.title).slice(0, 200) || url.hostname });
      if (sources.length >= 8) break;
    } catch {
      // Ignore malformed source URLs instead of emitting an unsafe link.
    }
  }
  return sources.length ? sources : undefined;
}

/**
 * Chuẩn hóa dữ liệu từ database hoặc từ biểu mẫu.
 * Trả null khi không có cửa sổ nào hợp lệ, để giao diện ẩn cả khối thay vì vẽ biểu đồ rỗng.
 */
export function normalizeHarvest(raw: unknown): HarvestCalendar | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const source = Array.isArray(record.windows) ? record.windows : Array.isArray(raw) ? raw : [];
  const windows = sortHarvestWindows(
    source.map((w, i) => normalizeWindow(w, i)).filter((w): w is HarvestWindow => w !== null),
  );
  if (windows.length === 0) return null;
  const note = record.note_i18n;
  const reviewed = asText(record.reviewed_on);
  return {
    windows,
    note_i18n: note && typeof note === "object" ? (note as HarvestCalendar["note_i18n"]) : undefined,
    reviewed_on: /^\d{4}-\d{2}-\d{2}$/.test(reviewed) ? reviewed : null,
    sources: normalizeSources(record.sources),
    review_origin: record.review_origin === "ai" || record.review_origin === "staff" ? record.review_origin : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Nhắc rà soát lịch mùa vụ
 *
 * Mùa vụ có thể do nhân sự hoặc tiến trình nghiên cứu tự động cập nhật. Không có
 * gì nhắc thì một biểu đồ ghi "Reviewed 24 Oct 2026" vẫn có thể nằm trên trang
 * vài năm và trông như mới. Phần dưới đây biến việc đó thành danh sách trong CRM,
 * tính từ chính dữ liệu và không cần thêm trạng thái rà soát song song.
 * ------------------------------------------------------------------ */

/** Sau ngưỡng này, một lịch mùa vụ được coi là đã cũ. */
export const HARVEST_REVIEW_MONTHS = 12;

/**
 * Ngày rà soát xa hơn ngưỡng này trong tương lai là lỗi nhập, không phải một lần
 * rà soát. Để một tuần dung sai vì người sửa có thể chọn ngày theo múi giờ khác
 * hoặc chọn "ngày mai" khi đang làm việc muộn, còn gõ nhầm năm thì lệch hàng
 * trăm ngày.
 */
export const HARVEST_REVIEW_FUTURE_DAYS = 7;

/**
 * none: danh mục chưa cấu hình mùa vụ, không nhắc.
 * missing: có mùa vụ nhưng ngày rà soát trống hoặc không dùng được.
 * stale: ngày rà soát cũ hơn ngưỡng.
 * current: còn trong hạn.
 */
export type HarvestReviewState = "none" | "missing" | "stale" | "current";

interface IsoDate {
  y: number;
  m: number;
  d: number;
}

function parseIsoDate(value: unknown): IsoDate | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Cộng thêm tháng, kẹp ngày vào cuối tháng đích (31/01 cộng một tháng ra 28 hoặc 29/02). */
export function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso);
  if (!date) return "";
  const total = date.y * 12 + (date.m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad2(month)}-${pad2(Math.min(date.d, lastDay))}`;
}

/** Số tháng đã trôi qua kể từ ngày rà soát. Chỉ dùng để hiển thị. */
export function monthsSinceReview(reviewedOn: string, today: string): number | null {
  const from = parseIsoDate(reviewedOn);
  const to = parseIsoDate(today);
  if (!from || !to) return null;
  const months = (to.y - from.y) * 12 + (to.m - from.m);
  return to.d < from.d ? months - 1 : months;
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d);
  return Math.round(ms / 86_400_000);
}

/**
 * Trạng thái rà soát của một lịch.
 *
 * Ngày ở tương lai xa bị coi là thiếu chứ không phải còn mới: một lần gõ nhầm
 * năm sẽ khiến lịch không bao giờ bị nhắc lại, đúng thứ cần phát hiện. Lệch vài
 * ngày thì bỏ qua, vì đó là chuyện múi giờ chứ không phải dữ liệu sai.
 */
export function harvestReviewState(
  reviewedOn: string | null | undefined,
  today: string,
): HarvestReviewState {
  const from = parseIsoDate(reviewedOn);
  const now = parseIsoDate(today);
  if (!from || !now) return "missing";
  if (daysBetween(now, from) > HARVEST_REVIEW_FUTURE_DAYS) return "missing";
  return addMonths(String(reviewedOn), HARVEST_REVIEW_MONTHS) <= today ? "stale" : "current";
}

export interface HarvestReviewEntry {
  id: string;
  slug: string;
  name: string;
  state: "missing" | "stale";
  reviewed_on: string | null;
  months_since_review: number | null;
}

/** Chỉ cần đúng những trường này, để kiểm thử được mà không phải dựng cả Category. */
export interface HarvestReviewCandidate {
  id: string;
  slug: string;
  name_i18n?: { en?: string | null } | null;
  harvest?: unknown;
}

/**
 * Danh mục cần rà soát lại lịch mùa vụ, cũ nhất lên trước.
 *
 * Danh mục chưa cấu hình mùa vụ không nằm trong danh sách: chưa có gì để rà
 * soát thì nhắc chỉ tạo tiếng ồn. Danh mục thiếu ngày xếp sau vì chưa biết cũ
 * tới đâu.
 */
export function harvestReviewQueue(
  categories: HarvestReviewCandidate[] | null | undefined,
  today: string,
): HarvestReviewEntry[] {
  const entries: HarvestReviewEntry[] = [];
  for (const category of Array.isArray(categories) ? categories : []) {
    if (!category || typeof category.slug !== "string") continue;
    const calendar = normalizeHarvest(category.harvest);
    if (!calendar) continue;
    const state = harvestReviewState(calendar.reviewed_on, today);
    if (state !== "missing" && state !== "stale") continue;
    entries.push({
      id: category.id,
      slug: category.slug,
      name: (category.name_i18n?.en ?? "").trim() || category.slug,
      state,
      reviewed_on: calendar.reviewed_on ?? null,
      months_since_review: calendar.reviewed_on ? monthsSinceReview(calendar.reviewed_on, today) : null,
    });
  }
  return entries.sort((a, b) => {
    if (a.state !== b.state) return a.state === "stale" ? -1 : 1;
    if (a.state === "stale") return (b.months_since_review ?? 0) - (a.months_since_review ?? 0);
    return a.name.localeCompare(b.name);
  });
}

/** Ngày rà soát dạng đọc được: "23 Oct 2026". Dùng chung với en-GB để không lệch giữa server và client. */
export function formatReviewedOn(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const label = HARVEST_MONTH_LABELS[month - 1];
  if (!label) return "";
  return `${day} ${label} ${year}`;
}
