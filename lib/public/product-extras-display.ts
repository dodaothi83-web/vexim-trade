/**
 * Hiển thị dữ liệu Phase 2 (đóng gói có cấu trúc, giá mẫu) trên trang người mua.
 *
 * Trang người mua là tiếng Anh, còn nhà cung cấp gõ "loại kiện" bằng tiếng Việt
 * (bao, thùng, hộp...). Ở đây chỉ dịch những từ đã biết; từ lạ có dấu tiếng Việt
 * thì bỏ phần loại kiện chứ không đẩy nguyên văn tiếng Việt lên trang tiếng Anh.
 * Không suy diễn: thiếu dữ liệu thì trả chuỗi rỗng, không đoán từ cột khác.
 *
 * Module thuần, không import gì, để script kiểm tra nạp thẳng bằng node.
 */

export interface PackagingExtrasLike {
  package_type?: string | null;
  package_weight_kg?: number | null;
  package_size?: string | null;
  units_per_carton?: number | null;
}

export interface SamplePriceLike {
  sample_price_usd?: number | null;
}

/** Từ tiếng Việt (đã bỏ dấu, chữ thường) → danh từ tiếng Anh dùng trên trang buyer. */
const PACKAGE_TYPE_EN: Record<string, string> = {
  bao: "bag",
  "bao jumbo": "jumbo bag",
  "bao big bag": "jumbo bag",
  "big bag": "jumbo bag",
  "jumbo bag": "jumbo bag",
  thung: "carton",
  "thung carton": "carton",
  carton: "carton",
  hop: "box",
  box: "box",
  "hop carton": "carton",
  pallet: "pallet",
  palet: "pallet",
  can: "can",
  chai: "bottle",
  bottle: "bottle",
  tui: "sack",
  sack: "sack",
  "bao pp": "pp woven bag",
  "bao vai": "woven bag",
  "bao giay": "paper bag",
  "bao jute": "jute bag",
  "thung go": "wooden crate",
  "thung nhua": "plastic crate",
  phuy: "drum",
  drum: "drum",
  khay: "tray",
  tray: "tray",
  goi: "pack",
  pack: "pack",
};

function normalizeType(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loại kiện bằng tiếng Anh, hoặc null khi không dịch được an toàn.
 * Chuỗi ASCII lạ vẫn giữ nguyên (nhà cung cấp có thể đã gõ tiếng Anh).
 */
export function packageTypeEnglish(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const normalized = normalizeType(value);
  if (!normalized) return null;
  const known = PACKAGE_TYPE_EN[normalized];
  if (known) return known;
  // Còn dấu tiếng Việt sau khi chuẩn hoá nghĩa là từ chưa biết: bỏ hẳn phần này.
  if (/[^\x20-\x7e]/.test(value)) return null;
  return normalized;
}

function formatWeight(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function positiveNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Ví dụ: "25 kg bag · 60x40x40 cm · 20 units/carton".
 * Rỗng khi chưa khai gì để trang buyer không hiện dòng trống.
 */
export function packagingSummaryEnglish(extras: Partial<PackagingExtrasLike>): string {
  const parts: string[] = [];
  const type = packageTypeEnglish(extras.package_type);
  const weight = positiveNumber(extras.package_weight_kg);
  if (weight && type) parts.push(`${formatWeight(weight)} kg ${type}`);
  else if (weight) parts.push(`${formatWeight(weight)} kg per package`);
  else if (type) parts.push(type.charAt(0).toUpperCase() + type.slice(1));
  const size = (extras.package_size ?? "").trim();
  if (size) parts.push(size);
  const units = positiveNumber(extras.units_per_carton);
  if (units) parts.push(`${formatWeight(units)} units/carton`);
  return parts.join(" · ");
}

/**
 * Giá mẫu hiển thị: "USD 5.00 per sample".
 * 0 là giá trị hợp lệ nhà cung cấp đã nhập; không tự đổi thành "miễn phí".
 */
export function samplePriceEnglish(extras: Partial<SamplePriceLike>): string | null {
  const value = extras.sample_price_usd;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const amount = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `USD ${amount} per sample`;
}
