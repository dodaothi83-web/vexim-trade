/**
 * Phase 2 hồ sơ sản phẩm: từ khoá tìm kiếm, giá mẫu và đóng gói có cấu trúc.
 *
 * Module thuần: không đọc CSDL, không gọi mạng, để form, server action và script
 * kiểm tra dùng chung một cách hiểu.
 *
 * Nguyên tắc:
 *  - Không đoán dữ liệu: giá trị trống thì trả `null`, không suy từ cột khác.
 *  - Giới hạn ở đây khớp với ràng buộc trong migration
 *    `20261072_product_keywords_sample_price_packaging.sql`.
 *  - Từ khoá là tiếng Anh, chữ thường, không dấu; người mua gõ tìm trên trang.
 */

export const MAX_PRODUCT_KEYWORDS = 3;
export const KEYWORD_MIN_LENGTH = 2;
export const KEYWORD_MAX_LENGTH = 40;
export const SAMPLE_PRICE_MAX_USD = 100_000;
export const PACKAGE_WEIGHT_MAX_KG = 100_000;
export const UNITS_PER_CARTON_MAX = 100_000;
export const PACKAGE_TYPE_MAX_LENGTH = 40;
export const PACKAGE_SIZE_MAX_LENGTH = 60;

/** Các cột Phase 2 trên `supplier_products`; dùng cho bước ghi có dự phòng. */
export const PRODUCT_EXTRAS_COLUMNS = [
  "keywords",
  "sample_price_usd",
  "package_type",
  "package_weight_kg",
  "package_size",
  "units_per_carton",
] as const;

export type ProductExtrasColumn = (typeof PRODUCT_EXTRAS_COLUMNS)[number];

export interface ProductExtras {
  keywords: string[];
  sample_price_usd: number | null;
  package_type: string | null;
  package_weight_kg: number | null;
  package_size: string | null;
  units_per_carton: number | null;
}

export const EMPTY_PRODUCT_EXTRAS: ProductExtras = {
  keywords: [],
  sample_price_usd: null,
  package_type: null,
  package_weight_kg: null,
  package_size: null,
  units_per_carton: null,
};

/** Bỏ dấu tiếng Việt + ký tự lạ; từ khoá phải là chữ không dấu để tìm được. */
function normalizeKeyword(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, KEYWORD_MAX_LENGTH)
    .trim();
}

/**
 * Nhận mảng hoặc chuỗi người dùng gõ (phẩy, chấm phẩy, xuống dòng).
 * Giữ tối đa 3 từ khoá, bỏ trùng, bỏ từ quá ngắn.
 */
export function sanitizeKeywords(raw: unknown): string[] {
  const parts: string[] = [];
  if (Array.isArray(raw)) {
    for (const value of raw) if (typeof value === "string") parts.push(value);
  } else if (typeof raw === "string") {
    parts.push(...raw.split(/[,;\n]/));
  }
  const out: string[] = [];
  for (const part of parts) {
    const keyword = normalizeKeyword(part);
    if (keyword.length < KEYWORD_MIN_LENGTH) continue;
    if (out.includes(keyword)) continue;
    out.push(keyword);
    if (out.length === MAX_PRODUCT_KEYWORDS) break;
  }
  return out;
}

function numberOrNull(raw: unknown, label: string, min: number, max: number, allowZero = false): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`${label} phải là số.`);
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`${label} phải là số.`);
  if (!allowZero && value <= 0) throw new Error(`${label} phải lớn hơn 0.`);
  if (allowZero && value < 0) throw new Error(`${label} không được âm.`);
  if (value > max) throw new Error(`${label} quá lớn.`);
  return value;
}

function textOrNull(raw: unknown, limit: number): string | null {
  const value = String(raw ?? "").trim().slice(0, limit);
  return value || null;
}

/**
 * Đọc và kiểm tra 6 trường Phase 2 từ form.
 *
 * `present(name)` cho biết form có gửi trường đó hay không: form cũ (chưa có ô)
 * thì giữ nguyên giá trị đã lưu thay vì xoá trắng.
 */
export function productExtrasFromForm(
  get: (name: string) => unknown,
  present: (name: string) => boolean,
  existing: Partial<ProductExtras> | null = null,
): ProductExtras {
  const keywords = present("keywords")
    ? sanitizeKeywords(get("keywords"))
    : sanitizeKeywords(existing?.keywords ?? []);
  const samplePrice = present("sample_price_usd")
    ? numberOrNull(get("sample_price_usd"), "Giá mẫu", 0, SAMPLE_PRICE_MAX_USD, true)
    : existing?.sample_price_usd ?? null;
  const packageType = present("package_type")
    ? textOrNull(get("package_type"), PACKAGE_TYPE_MAX_LENGTH)
    : (existing?.package_type ?? null);
  const packageWeight = present("package_weight_kg")
    ? numberOrNull(get("package_weight_kg"), "Khối lượng mỗi kiện", 0, PACKAGE_WEIGHT_MAX_KG)
    : (existing?.package_weight_kg ?? null);
  const packageSize = present("package_size")
    ? textOrNull(get("package_size"), PACKAGE_SIZE_MAX_LENGTH)
    : (existing?.package_size ?? null);
  const unitsPerCarton = present("units_per_carton")
    ? numberOrNull(get("units_per_carton"), "Số đơn vị mỗi thùng", 0, UNITS_PER_CARTON_MAX)
    : (existing?.units_per_carton ?? null);

  return {
    keywords,
    sample_price_usd: samplePrice,
    package_type: packageType,
    package_weight_kg: packageWeight,
    package_size: packageSize,
    units_per_carton: unitsPerCarton,
  };
}

/** Chuỗi mô tả đóng gói ngắn cho trang người mua và CRM; rỗng khi chưa khai. */
export function packagingSummary(extras: Partial<ProductExtras>): string {
  const parts: string[] = [];
  const type = (extras.package_type ?? "").trim();
  const weight = extras.package_weight_kg ?? null;
  if (type && weight) parts.push(`${type} ${formatNumber(weight)} kg`);
  else if (type) parts.push(type);
  else if (weight) parts.push(`${formatNumber(weight)} kg/kiện`);
  const size = (extras.package_size ?? "").trim();
  if (size) parts.push(size);
  const units = extras.units_per_carton ?? null;
  if (units) parts.push(`${formatNumber(units)} đơn vị/thùng`);
  return parts.join(" · ");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value);
}

/** Câu nhắc khi thiếu dữ liệu Phase 2, đúng một câu, không doạ. */
export function extrasHint(extras: Partial<ProductExtras>): string | null {
  if (!extras.keywords?.length) return "Thêm 1–3 từ khoá tiếng Anh để người mua tìm thấy sản phẩm.";
  if (!extras.package_weight_kg && !(extras.package_type ?? "").trim()) return "Ghi loại kiện và khối lượng mỗi kiện.";
  if (extras.sample_price_usd == null) return "Nêu giá mẫu nếu bạn bán mẫu.";
  return null;
}
