/**
 * Đơn vị bán của bảng giá theo số lượng.
 *
 * Nông sản rời báo giá theo kg (người mua thấy MT khi danh mục niêm yết theo tấn). Hàng
 * đóng gói như nước giải khát, bánh kẹo, đồ hộp lại bán theo lon, chai, gói, hộp hoặc
 * thùng. Một bảng giá dùng đúng MỘT đơn vị cho mọi mức: số lượng là số nguyên đơn vị,
 * giá là giá trên một đơn vị.
 *
 * Đơn vị đếm (lon, chai…) không quy đổi được ra kg vì mỗi sản phẩm nặng khác nhau, nên
 * giá theo các đơn vị này không vào phép so sánh, khoảng giá danh mục hay bộ lọc MOQ
 * tính theo khối lượng. Chúng chỉ hiển thị đúng như nhà cung cấp khai.
 *
 * Lưu trữ: trường `unit` trên từng mức giá trong `product_quantity_price_revisions.tiers`.
 * Bảng giá kg không ghi trường này để dữ liệu cũ giữ nguyên từng byte; thiếu trường là kg.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */
export const SALES_UNITS = ["kg", "can", "bottle", "pack", "box", "carton"] as const;
export type SalesUnit = (typeof SALES_UNITS)[number];
export const DEFAULT_SALES_UNIT: SalesUnit = "kg";

type UnitLabels = { vi: string; en: string; enPlural: string };

export const SALES_UNIT_LABELS: Record<SalesUnit, UnitLabels> = {
  kg: { vi: "kg", en: "kg", enPlural: "kg" },
  can: { vi: "lon", en: "can", enPlural: "cans" },
  bottle: { vi: "chai", en: "bottle", enPlural: "bottles" },
  pack: { vi: "gói", en: "pack", enPlural: "packs" },
  box: { vi: "hộp", en: "box", enPlural: "boxes" },
  carton: { vi: "thùng", en: "carton", enPlural: "cartons" },
};

/** Thiếu hoặc rỗng là kg (dữ liệu trước khi có đơn vị); giá trị lạ trả null để từ chối. */
export function normalizeSalesUnit(raw: unknown): SalesUnit | null {
  if (raw === undefined || raw === null) return DEFAULT_SALES_UNIT;
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  if (!value) return DEFAULT_SALES_UNIT;
  return (SALES_UNITS as readonly string[]).includes(value) ? value as SalesUnit : null;
}

/** Chỉ kg quy đổi được sang khối lượng (so giá, khoảng giá, lọc MOQ, đổi sang MT). */
export function isWeightSalesUnit(unit: SalesUnit): boolean {
  return unit === "kg";
}

/** Nhãn đơn vị ở form và CRM: "lon" hoặc "can". */
export function salesUnitLabel(unit: SalesUnit, lang: "vi" | "en" = "vi"): string {
  return lang === "en" ? SALES_UNIT_LABELS[unit].en : SALES_UNIT_LABELS[unit].vi;
}

/** Số lượng cho người mua theo đơn vị đếm: "1 can", "5,000 cans". */
export function formatCountQuantity(quantity: number, unit: SalesUnit): string {
  const labels = SALES_UNIT_LABELS[unit];
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(quantity)} ${quantity === 1 ? labels.en : labels.enPlural}`;
}
