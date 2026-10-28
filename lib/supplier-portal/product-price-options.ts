/** Fixed supplier-facing price units. Labels and values are English trade codes. */
export const SUPPLIER_PRICE_UNITS = [
  { value: "kg", label: "kg" },
  { value: "MT", label: "MT" },
  { value: "lb", label: "lb" },
  { value: "carton", label: "carton" },
  { value: "sack", label: "sack" },
  { value: "bag", label: "bag" },
  { value: "box", label: "box" },
  { value: "bottle", label: "bottle" },
  { value: "piece", label: "piece" },
  { value: "set", label: "set" },
] as const;

export const SUPPLIER_PRICE_CURRENCIES = [
  { value: "USD", label: "USD" },
  { value: "VND", label: "VND" },
  { value: "EUR", label: "EUR" },
] as const;

export const isSupplierPriceUnit = (value: string) => SUPPLIER_PRICE_UNITS.some((option) => option.value === value);
export const isSupplierPriceCurrency = (value: string) => SUPPLIER_PRICE_CURRENCIES.some((option) => option.value === value);

/** Match stored unit codes case-insensitively (e.g. "Carton" -> "carton", "mt" -> "MT"); drop unsupported legacy text. */
export function normalizeSupplierPriceUnit(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const match = SUPPLIER_PRICE_UNITS.find((option) => option.value.toLowerCase() === lower);
  return match ? match.value : "";
}

/** Match stored currency codes case-insensitively (e.g. "usd" -> "USD"); drop unsupported legacy text. */
export function normalizeSupplierPriceCurrency(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  const match = SUPPLIER_PRICE_CURRENCIES.find((option) => option.value === upper);
  return match ? match.value : "";
}
