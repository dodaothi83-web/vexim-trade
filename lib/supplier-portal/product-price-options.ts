/** Fixed supplier-facing price units. Values are stable buyer-facing trade codes. */
export const SUPPLIER_PRICE_UNITS = [
  { value: "kg", label: "kg" },
  { value: "MT", label: "Tấn (MT)" },
  { value: "lb", label: "Pound (lb)" },
  { value: "carton", label: "Thùng (carton)" },
  { value: "sack", label: "Bao (sack)" },
  { value: "bag", label: "Túi (bag)" },
  { value: "box", label: "Hộp (box)" },
  { value: "bottle", label: "Chai (bottle)" },
  { value: "piece", label: "Cái (piece)" },
  { value: "set", label: "Bộ (set)" },
] as const;

export const SUPPLIER_PRICE_CURRENCIES = [
  { value: "USD", label: "USD – Đô la Mỹ" },
  { value: "VND", label: "VND – Đồng Việt Nam" },
  { value: "EUR", label: "EUR – Euro" },
] as const;

export const isSupplierPriceUnit = (value: string) => SUPPLIER_PRICE_UNITS.some((option) => option.value === value);
export const isSupplierPriceCurrency = (value: string) => SUPPLIER_PRICE_CURRENCIES.some((option) => option.value === value);
