import { formatMoney, priceRangeText } from "../products/price-display.ts";

/**
 * Đơn vị giá: quy ước thị trường, không phải quy ước nội bộ.
 *
 * Người mua so giá trên thế giới đọc theo đơn vị của từng ngành, không phải theo
 * đơn vị mà hệ thống thấy tiện. Gạo, hồ tiêu, cà phê robusta, quế và hồi niêm
 * yết theo tấn. Nhân điều, tôm và cá niêm yết theo kg. Riêng nhân điều còn xuất
 * hiện theo pound trong các bản tin thương mại quốc tế và trong giá VINACAS,
 * nên hiển thị cả hai.
 *
 * Nguyên tắc: lưu và tính bằng kg, hiển thị theo đơn vị thị trường của danh mục.
 */

/** Đơn vị chuẩn dùng nội bộ. Mọi phép tính đi qua kg. */
export type PriceUnit = "kg" | "lb" | "mt";

export const KG_PER_UNIT: Record<PriceUnit, number> = {
  kg: 1,
  lb: 0.45359237,
  mt: 1000,
};

export const PRICE_UNIT_LABEL: Record<PriceUnit, { short: string; long: string }> = {
  kg: { short: "kg", long: "kilogram" },
  lb: { short: "lb", long: "pound" },
  mt: { short: "MT", long: "metric ton" },
};

/**
 * Quy ước hiển thị thống nhất theo danh mục: mỗi danh mục dùng đúng một đơn vị (kg hoặc MT).
 */
export const MARKET_PRICE_UNITS: Record<string, { primary: PriceUnit; secondary?: PriceUnit }> = {
  cashew: { primary: "kg" },
  "cashew-kernels": { primary: "kg" },
  "cinnamon-star-anise": { primary: "mt" },
  coffee: { primary: "mt" },
  rice: { primary: "mt" },
  pepper: { primary: "mt" },
  "cassia-cinnamon": { primary: "mt" },
  "star-anise": { primary: "mt" },
  coconut: { primary: "mt" },
  "dried-fruits": { primary: "mt" },
  "dried-spices": { primary: "mt" },
  spices: { primary: "mt" },
  "seafood-processed-fisheries-products": { primary: "kg" },
};

export const DEFAULT_PRICE_UNIT: PriceUnit = "kg";

/**
 * Đoán đơn vị theo từ khóa trong slug, chỉ dùng khi danh mục chưa có cấu hình và
 * chưa có trong bảng trên.
 *
 * Lý do cần: slug thực tế ngoài production không khớp danh sách mình đoán trước
 * ("spices" thay cho "dried-spices"). Thà suy theo ngành còn hơn im lặng mặc
 * định kg cho một ngành bán theo tấn.
 */
const UNIT_HINTS: Array<{ pattern: RegExp; unit: PriceUnit }> = [
  { pattern: /seafood|fisher|shrimp|prawn|fish|squid|tuna|pangasius/, unit: "kg" },
  { pattern: /cashew|nut|kernel/, unit: "kg" },
  { pattern: /rice|coffee|pepper|cassia|cinnamon|anise|spice|coconut|fruit|bean|tea|sugar/, unit: "mt" },
];

export function priceUnitHint(slug: string): PriceUnit | null {
  const text = (slug || "").toLowerCase();
  for (const hint of UNIT_HINTS) if (hint.pattern.test(text)) return hint.unit;
  return null;
}

/** Đơn vị hiển thị thống nhất của một danh mục (kg hoặc MT), đọc từ cấu hình trong CRM trước, rồi tới bảng quy ước. */
export function displayUnitsForCategory(slug: string, configured?: string | null): { primary: PriceUnit; secondary?: PriceUnit } {
  const parsed = parsePriceUnit(configured);
  if (parsed === "kg" || parsed === "mt") return { primary: parsed };
  const market = MARKET_PRICE_UNITS[slug];
  if (market) return { primary: market.primary };
  return { primary: priceUnitHint(slug) ?? DEFAULT_PRICE_UNIT };
}

/**
 * Đọc đơn vị từ chuỗi tự do mà nhà cung cấp hoặc nhân viên đã nhập.
 *
 * Cột `unit` trong database là chữ tự do ("MT", "kg", "thùng", "USD/kg"), cột
 * `currency` đôi khi đã kèm đơn vị ("USD/kg"). Hàm này đọc cả hai chỗ và trả
 * null khi không nhận ra, để phép cộng giá không bao giờ đoán bừa.
 */
export function parsePriceUnit(...sources: Array<string | null | undefined>): PriceUnit | null {
  for (const source of sources) {
    if (!source) continue;
    // "US cents/lb" và "USD/lb" đều phải ra lb trước khi xét tới "t" trong "ton".
    const text = source.toLowerCase();
    if (/(^|[^a-z])lb(s)?([^a-z]|$)|pound/.test(text)) return "lb";
    if (/(^|[^a-z])kg([^a-z]|$)|kilogram|kilo/.test(text)) return "kg";
    if (/(^|[^a-z])(mt|t|ton|tonne|tons|tonnes)([^a-z]|$)/.test(text)) return "mt";
  }
  return null;
}

/**
 * Quy đổi MỘT MỨC GIÁ về giá trên mỗi kg.
 *
 * Lưu ý dễ sai: đây là giá trên một đơn vị, không phải khối lượng. 7,900 USD/tấn
 * là 7,90 USD/kg, tức chia cho 1.000, không phải nhân. Chiều ngược lại ở
 * fromPricePerKg. Nhầm chiều ở đây thì con số sai một nghìn lần.
 */
export function toPricePerKg(value: number, unit: PriceUnit | null): number | null {
  if (!unit) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value / KG_PER_UNIT[unit];
}

/** Quy đổi giá trên mỗi kg sang đơn vị hiển thị. */
export function fromPricePerKg(pricePerKg: number, unit: PriceUnit): number {
  return pricePerKg * KG_PER_UNIT[unit];
}

/**
 * Hiển thị một mức giá: "$8/kg". Luôn có đơn vị đi kèm, không bao giờ để số trần.
 * Ký hiệu tiền tệ và cách làm tròn dùng chung ở `lib/products/price-display.ts`.
 */
export function formatUnitPrice(value: number, unit: PriceUnit, currency = "USD"): string {
  return `${formatMoney(value, currency)}/${PRICE_UNIT_LABEL[unit].short}`;
}

/** Hiển thị một khoảng: "$8–9/kg". Một mức thì ghi một mức. */
export function formatUnitRange(low: number, high: number, unit: PriceUnit, currency = "USD"): string {
  return `${priceRangeText(low, high, currency)}/${PRICE_UNIT_LABEL[unit].short}`;
}
