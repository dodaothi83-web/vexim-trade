export interface ProductSpecificationRow {
  key: string;
  label: string;
  value: string;
}

const SPEC_LABELS: Record<string, string> = {
  "quality / grade": "Quality",
  "size classification (grade)": "Available grades",
  "broken rate": "Broken rate",
  "safety certification": "Safety certification",
  "production & processing": "Processing",
  "shelf life": "Shelf life",
  "packaging specification": "Packaging options",
  "minimum order quantity (moq)": "MOQ",
};

export function productSpecificationKey(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Turn supplier-authored lines such as "Color: Ivory white" into scannable
 * rows. Unstructured lines are preserved instead of being silently discarded.
 */
export function parseProductSpecification(spec: string | null | undefined): ProductSpecificationRow[] {
  const rows: ProductSpecificationRow[] = [];
  const additional: string[] = [];
  for (const rawLine of (spec ?? "").split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*•]\s*/, "").trim();
    if (!line) continue;
    const match = line.match(/^([^:]{2,80}):\s*(.+)$/);
    if (!match) {
      additional.push(line);
      continue;
    }
    const key = productSpecificationKey(match[1]);
    const value = match[2].trim();
    if (!key || !value) continue;
    rows.push({ key, label: SPEC_LABELS[key] ?? match[1].trim(), value });
  }
  if (additional.length) rows.push({ key: "additional details", label: "Additional details", value: additional.join("\n") });
  return rows;
}

function quantityUnit(quantityText: string, singular: string, plural: string): string {
  const quantity = Number(quantityText.replace(",", "."));
  return `${quantityText} ${quantity === 1 ? singular : plural}`;
}

/** Translate a stored trade unit for buyer-facing price and warning text. */
export function publicProductUnitDisplay(unit: string | null | undefined): string {
  const value = (unit ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ({
    tan: "MT",
    thung: "carton",
    bo: "set",
    tui: "bag",
    bao: "bag",
  } as Record<string, string>)[normalized] ?? value;
}

/** Normalize a unit already embedded in a formatted reference price. */
export function publicProductPriceDisplay(price: string | null | undefined): string {
  return (price ?? "").replace(/\/\s*(tấn|tan|thùng|thung|bộ|bo|túi|tui|bao)(?=\s|$|[,;])/gi, (_match, unit: string) => `/${publicProductUnitDisplay(unit)}`);
}

/** Translate common Vietnamese MOQ units without changing the stored value. */
export function publicProductMoqDisplay(moq: string | null | undefined): string {
  const value = (moq ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const match = value.match(/^(\d+(?:[.,]\d+)?)\s*(tấn|tan|thùng|thung|bộ|bo|túi|tui|bao)(?=\s|$|[,;])(.*)$/i);
  if (!match) return value;
  const units = {
    "tấn": ["metric ton", "metric tons"],
    tan: ["metric ton", "metric tons"],
    "thùng": ["carton", "cartons"],
    thung: ["carton", "cartons"],
    "bộ": ["set", "sets"],
    bo: ["set", "sets"],
    "túi": ["bag", "bags"],
    tui: ["bag", "bags"],
    bao: ["bag", "bags"],
  } as const;
  const [singular, plural] = units[match[2].toLowerCase() as keyof typeof units];
  return `${quantityUnit(match[1], singular, plural)}${match[3]}`
    .replace(/\bcho\b/gi, "for")
    .replace(/\btối thiểu\b/gi, "minimum");
}

/** Translate common packaging terminology when an older record has no English copy. */
export function publicProductPackagingDisplay(packaging: string | null | undefined): string {
  let value = (packaging ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  value = value
    .replace(/(\d+(?:[.,]\d+)?)\s*(kg|g)\s*\/\s*thùng\b/gi, "$1$2 / carton")
    .replace(/thùng\s+(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi, "$1$2 cartons")
    .replace(/thùng\s+(\d+)\s+túi\b/gi, "$1 bags per carton")
    .replace(/bao\s+PP\s+(\d+(?:[.,]\d+)?\s*(?:kg|g))\s+hoặc\s+(\d+(?:[.,]\d+)?\s*(?:kg|g))/gi, "$1 or $2 PP bags")
    .replace(/bao\s+đay\s+(\d+(?:[.,]\d+)?\s*(?:kg|g))\s+hoặc\s+bao\s+tấn/gi, "$1 jute bags or bulk bags")
    .replace(/túi\s+(\d+(?:[.,]\d+)?\s*(?:kg|g))\s+hút\s+chân\s+không/gi, "$1 vacuum bags")
    .replace(/túi\s+IQF\s+(\d+(?:[.,]\d+)?\s*(?:kg|g))/gi, "IQF $1 bags")
    .replace(/túi\s+(\d+(?:[.,]\d+)?\s*(?:kg|g))/gi, "$1 bags")
    .replace(/bao\s+(\d+(?:[.,]\d+)?\s*(?:kg|g))\s+in\s+tiếng\s+Hàn/gi, "$1 bags with Korean printing")
    .replace(/carton\s+(\d+)\s+lớp/gi, "$1-layer carton")
    .replace(/hút\s+chân\s+không/gi, "vacuum packed")
    .replace(/có\s+van\s+một\s+chiều/gi, "with one-way valve")
    .replace(/góc\s+bảo\s+vệ/gi, "corner protectors")
    .replace(/thùng\s+carton/gi, "carton box")
    .replace(/bao\s+đay/gi, "jute bags")
    .replace(/bao\s+tấn/gi, "bulk bags")
    .replace(/bao\s+PP/gi, "PP bags")
    .replace(/thùng/gi, "cartons")
    .replace(/túi/gi, "bags")
    .replace(/bao/gi, "bags")
    .replace(/hoặc/gi, "or")
    .replace(/may\s+kín/gi, "sewn closed")
    .replace(/lớp/gi, "layer")
    .replace(/in\s+tiếng\s+Hàn/gi, "Korean printing")
    .replace(/ngoài\s+trời/gi, "outdoor")
    .replace(/tháo\s+rời/gi, "knock-down")
    .replace(/bóc\s+vỏ/gi, "peeled")
    .replace(/bỏ\s+chỉ/gi, "deveined")
    .replace(/đông\s+lạnh/gi, "frozen")
    .replace(/(\d+),(\d{1,2})(?=\s*(?:kg|g)\b)/gi, "$1.$2");
  return value.replace(/\s+/g, " ").trim();
}

/** Render supplier-stated capacity in English while preserving quantity and unit. */
export function publicProductCapacityDisplay(capacity: string | null | undefined): string {
  let value = (capacity ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  value = value.replace(/(\d+(?:[.,]\d+)?)\s*(tấn|tan)\b/gi, (_match, amount: string) => quantityUnit(amount, "metric ton", "metric tons"));
  return value
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:thùng|thung)\b/gi, (_match, amount: string) => quantityUnit(amount, "carton", "cartons"))
    .replace(/(\d+(?:[.,]\d+)?)\s*(?:bộ|bo)(?=\s|$|[,;])/gi, (_match, amount: string) => quantityUnit(amount, "set", "sets"))
    .replace(/\s*\/\s*tháng\b/gi, " per month")
    .replace(/\s*\/\s*thang\b/gi, " per month")
    .replace(/\bmỗi\s+tháng\b/gi, "per month")
    .replace(/\btháng\b/gi, "month")
    .replace(/\s+/g, " ").trim();
}

/** Translate standard payment wording without inventing or changing terms. */
export function publicProductPaymentTermsDisplay(terms: string | null | undefined): string {
  let value = (terms ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  value = value
    .replace(/(\d+(?:[.,]\d+)?%)\s+sau\s+(\d+)\s+ngày\s+nhận hàng/gi, "$1 payable $2 days after receipt")
    .replace(/^\s*thanh toán\s+(?=\d)/i, "")
    .replace(/\bkhi\s+có\s+B\/L\b/gi, "when B/L is available")
    .replace(/\btrước(?:\s+khi)?\s+giao\b/gi, "before delivery")
    .replace(/\bcọc\b/gi, "deposit")
    .replace(/\bngày\b/gi, "days")
    .replace(/\bnhận hàng\b/gi, "receipt")
    .replace(/\bthỏa thuận\b/gi, "to be agreed")
    .replace(/\bthanh toán\b/gi, "payment");
  return value.replace(/\s+/g, " ").trim();
}

const PLACE_NAMES: Record<string, string> = {
  "ho chi minh": "Ho Chi Minh City",
  "ho chi minh city": "Ho Chi Minh City",
  "tp ho chi minh": "Ho Chi Minh City",
  "cat lai": "Cat Lai",
  "cai mep": "Cai Mep",
  "cang den": "destination port",
  "cang xuat": "export port",
  "ha noi": "Hanoi",
  "da nang": "Da Nang",
  "hai phong": "Hai Phong",
  "can tho": "Can Tho",
  "dong nai": "Dong Nai",
  "binh duong": "Binh Duong",
  "binh phuoc": "Binh Phuoc",
  "dak lak": "Dak Lak",
  "lam dong": "Lam Dong",
  "nghe an": "Nghe An",
  "gia lai": "Gia Lai",
  "binh thuan": "Binh Thuan",
  "ba ria vung tau": "Ba Ria - Vung Tau",
  "vung tau": "Vung Tau",
  "tan cang": "Tan Cang",
  "thi vai": "Thi Vai",
  "song than": "Song Than",
};

/** Use conventional English spellings for known Vietnamese place aliases. */
export function publicProductPlaceDisplay(place: string | null | undefined): string {
  const value = (place ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (PLACE_NAMES[normalized]) return PLACE_NAMES[normalized];
  return value
    .replace(/\bHồ Chí Minh\b/gi, "Ho Chi Minh City")
    .replace(/\bCát Lái\b/gi, "Cat Lai")
    .replace(/\bCái Mép\b/gi, "Cai Mep")
    .replace(/\bcảng đến\b/gi, "destination port")
    .replace(/\bcảng xuất\b/gi, "export port");
}

/** Use an English label for known port aliases; keep unknown supplier input unchanged. */
export function publicExportPortDisplay(port: string | null | undefined): string {
  const value = (port ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized.includes("tctt") && normalized.includes("thi vai")) {
    return "TCTT (Tan Cang - Thi Vai International Port)";
  }
  return publicProductPlaceDisplay(value);
}
