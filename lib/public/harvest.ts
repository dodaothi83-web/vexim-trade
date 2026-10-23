import type { HarvestCalendar, HarvestWindow } from "@/lib/types";

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
  };
}

/** Ngày rà soát dạng đọc được: "23 Oct 2026". Dùng chung với en-GB để không lệch giữa server và client. */
export function formatReviewedOn(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const label = HARVEST_MONTH_LABELS[month - 1];
  if (!label) return "";
  return `${day} ${label} ${year}`;
}
