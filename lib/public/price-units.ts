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
  mt: { short: "t", long: "tonne" },
};

/**
 * Quy ước hiển thị theo danh mục.
 *
 * `primary` là đơn vị người mua Việt Nam quen thấy trong báo giá FOB.
 * `secondary` chỉ điền khi thị trường thật sự đọc song song hai đơn vị.
 */
export const MARKET_PRICE_UNITS: Record<string, { primary: PriceUnit; secondary?: PriceUnit }> = {
  cashew: { primary: "kg", secondary: "lb" },
  coffee: { primary: "mt" },
  rice: { primary: "mt" },
  pepper: { primary: "mt" },
  "cassia-cinnamon": { primary: "mt" },
  "star-anise": { primary: "mt" },
  coconut: { primary: "mt" },
  "dried-fruits": { primary: "mt" },
  "dried-spices": { primary: "mt" },
  "seafood-processed-fisheries-products": { primary: "kg" },
};

export const DEFAULT_PRICE_UNIT: PriceUnit = "kg";

/** Đơn vị hiển thị của một danh mục, đọc từ cấu hình trong CRM trước, rồi tới bảng quy ước. */
export function displayUnitsForCategory(slug: string, configured?: string | null): { primary: PriceUnit; secondary?: PriceUnit } {
  const parsed = parsePriceUnit(configured);
  const market = MARKET_PRICE_UNITS[slug];
  if (parsed) return { primary: parsed, secondary: market?.secondary === parsed ? undefined : market?.secondary };
  return market ?? { primary: DEFAULT_PRICE_UNIT };
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

/** Số chữ số thập phân hợp lý: tấn làm tròn tới 1, kg và pound tới 2. */
export function decimalsForUnit(unit: PriceUnit): number {
  return unit === "mt" ? 0 : 2;
}

/** Hiển thị một mức giá: "USD 7.90/kg". Luôn có đơn vị đi kèm, không bao giờ để số trần. */
export function formatUnitPrice(value: number, unit: PriceUnit, currency = "USD"): string {
  const decimals = decimalsForUnit(unit);
  const rounded = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${currency} ${rounded}/${PRICE_UNIT_LABEL[unit].short}`;
}

/** Hiển thị một khoảng: "USD 7.60 to 8.40/kg". Một mức thì ghi một mức. */
export function formatUnitRange(low: number, high: number, unit: PriceUnit, currency = "USD"): string {
  const decimals = decimalsForUnit(unit);
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const suffix = `/${PRICE_UNIT_LABEL[unit].short}`;
  if (Math.abs(high - low) < 10 ** -decimals / 2) return `${currency} ${fmt(low)}${suffix}`;
  return `${currency} ${fmt(low)} to ${fmt(high)}${suffix}`;
}
