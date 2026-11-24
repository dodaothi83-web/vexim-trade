/**
 * Phương thức vận chuyển người mua chọn trên form RFQ. Lưu mã (specs.shipping_method), hiển thị
 * theo ngôn ngữ ở form, CRM và cổng nhà cung cấp. Mã lạ bị bỏ qua (không lưu, không hiển thị).
 */
export const SHIPPING_METHODS = ["sea_fcl", "sea_lcl", "air", "express", "rail", "road"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export const SHIPPING_METHOD_LABELS: Record<"en" | "vi", Record<ShippingMethod, string>> = {
  en: {
    sea_fcl: "Sea freight, full container (FCL)",
    sea_lcl: "Sea freight, shared container (LCL)",
    air: "Air freight",
    express: "Express courier (DHL, FedEx, UPS)",
    rail: "Rail freight",
    road: "Road freight",
  },
  vi: {
    sea_fcl: "Đường biển, nguyên container (FCL)",
    sea_lcl: "Đường biển, hàng lẻ (LCL)",
    air: "Đường hàng không",
    express: "Chuyển phát nhanh (DHL, FedEx, UPS)",
    rail: "Đường sắt",
    road: "Đường bộ",
  },
};

export function isShippingMethod(value: unknown): value is ShippingMethod {
  return typeof value === "string" && (SHIPPING_METHODS as readonly string[]).includes(value);
}

export function shippingMethodLabel(value: unknown, language: "en" | "vi" = "en"): string | null {
  return isShippingMethod(value) ? SHIPPING_METHOD_LABELS[language][value] : null;
}

/** Giá mục tiêu: một ô số + một lựa chọn "tiền tệ/đơn vị". Lưu tách target_price_currency và target_price_unit. */
export const TARGET_PRICE_BASES = ["USD/kg", "USD/MT", "EUR/kg", "EUR/MT"] as const;
export const TARGET_PRICE_CURRENCIES = ["USD", "EUR"] as const;
export const TARGET_PRICE_UNITS = ["kg", "MT"] as const;

/** "7.2 USD/kg" hoặc null khi thiếu giá; tiền tệ hay đơn vị lạ thì bỏ phần đó, không bịa. */
export function targetPriceText(price: unknown, currency: unknown, unit: unknown): string | null {
  const amount = typeof price === "number" ? price : typeof price === "string" ? Number(price) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cur = typeof currency === "string" && (TARGET_PRICE_CURRENCIES as readonly string[]).includes(currency) ? currency : "";
  const per = typeof unit === "string" && (TARGET_PRICE_UNITS as readonly string[]).includes(unit) ? unit : "";
  return `${amount} ${cur}${cur && per ? "/" : ""}${per}`.trim();
}
