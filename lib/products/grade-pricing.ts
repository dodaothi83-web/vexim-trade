import { gradeKey, resolveGrade } from "@/lib/public/grade-resolution";
import { displayUnitsForCategory, formatUnitPrice, formatUnitRange, parsePriceUnit, toPricePerKg, fromPricePerKg, type PriceUnit } from "@/lib/public/price-units";
import type { Category, ProductAttributeField, SupplierProduct } from "@/lib/types";

export const MIN_GRADE_ROWS = 1;
export const MAX_GRADE_ROWS = 10;
export const CUSTOM_GRADE_OPTION = "__custom__";

export const GRADE_INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"] as const;
export type GradeIncoterm = (typeof GRADE_INCOTERMS)[number];

export const MOQ_UNITS = ["kg", "mt", "bag", "carton", "cont_20ft", "cont_40ft"] as const;
export type MoqUnit = (typeof MOQ_UNITS)[number];

export const MOQ_UNIT_OPTIONS: ReadonlyArray<{
  value: MoqUnit;
  viLabel: string;
  adminLabel: string;
  requiresWeight: boolean;
  isContainer: boolean;
  weightPlaceholder: string;
  weightLabelVi: string;
}> = [
  { value: "kg", viLabel: "kg", adminLabel: "kg", requiresWeight: false, isContainer: false, weightPlaceholder: "", weightLabelVi: "" },
  { value: "mt", viLabel: "tấn (MT)", adminLabel: "tấn (MT)", requiresWeight: false, isContainer: false, weightPlaceholder: "", weightLabelVi: "" },
  { value: "bag", viLabel: "bao", adminLabel: "bao (bags - nhập kg/bao)", requiresWeight: true, isContainer: false, weightPlaceholder: "VD: 25", weightLabelVi: "kg/bao" },
  { value: "carton", viLabel: "thùng", adminLabel: "thùng (cartons - nhập kg/thùng)", requiresWeight: true, isContainer: false, weightPlaceholder: "VD: 10", weightLabelVi: "kg/thùng" },
  { value: "cont_20ft", viLabel: "container 20ft", adminLabel: "container 20ft", requiresWeight: false, isContainer: true, weightPlaceholder: "", weightLabelVi: "" },
  { value: "cont_40ft", viLabel: "container 40ft", adminLabel: "container 40ft", requiresWeight: false, isContainer: true, weightPlaceholder: "", weightLabelVi: "" },
];

export const LEAD_TIME_UNITS = ["days", "weeks", "on_request"] as const;
export type LeadTimeUnit = (typeof LEAD_TIME_UNITS)[number];

export const LEAD_TIME_UNIT_OPTIONS: ReadonlyArray<{
  value: LeadTimeUnit;
  viLabel: string;
}> = [
  { value: "days", viLabel: "ngày" },
  { value: "weeks", viLabel: "tuần" },
  { value: "on_request", viLabel: "Theo yêu cầu" },
];

export type ProductGradeRow = {
  grade: string;
  is_custom: boolean;
  price_min: number | null;
  price_max: number | null;
  incoterm: string;
  moq: string;
  moq_qty?: number | null;
  moq_unit?: MoqUnit | null;
  moq_unit_weight_kg?: number | null;
  moq_mt_equivalent?: number | null;
};

export type ProductGradeRowDraft = {
  id: string;
  selectedGrade: string;
  customGrade: string;
  priceMin: string;
  priceMax: string;
  incoterm: string;
  moq: string;
  moqQty?: string;
  moqUnit?: MoqUnit;
  moqUnitWeightKg?: string;
  moqLegacyRaw?: string;
};

export type ProductGradeRowValidation = {
  gradeError: string | null;
  priceError: string | null;
  incotermError: string | null;
  moqError: string | null;
  valid: boolean;
  normalized: ProductGradeRow | null;
};

export type PublicProductGradeRow = {
  grade: string;
  isCustom: boolean;
  priceMin: number | null;
  priceMax: number | null;
  priceText: string | null;
  incoterm: string | null;
  moq: string;
  moqUnit?: MoqUnit | null;
  moqMtEquivalent?: number | null;
};

export type CategoryPriceUnitMeta = {
  primary: PriceUnit;
  tradeUnit: "kg" | "MT";
  unitLabel: "USD/kg" | "USD/MT";
  headerLabel: "GIÁ (USD/KG)" | "GIÁ (USD/MT)";
};

export type CategoryGradeSource = {
  slug?: string | null;
  price_unit?: string | null;
  moq_units?: readonly string[] | null;
  product_fields?: ProductAttributeField[] | null;
} | null | undefined;

const BUILTIN_CATEGORY_GRADES: Array<{ match: RegExp; grades: readonly string[] }> = [
  {
    match: /(?:^|-)cashew(?:-|$)/i,
    grades: ["W180", "W210", "W240", "W320", "W450", "SW", "WS", "LP", "SP"],
  },
  {
    match: /(?:^|-)pepper(?:-|$)|^spices$/i,
    grades: ["500 g/L", "550 g/L", "570 g/L", "580 g/L", "White pepper"],
  },
  {
    match: /cinnamon|anise|cassia/i,
    grades: ["Cassia whole", "Cassia split", "Cassia powder", "Star anise", "Star anise oil"],
  },
  {
    match: /(?:^|-)rice(?:-|$)/i,
    grades: ["ST25", "Jasmine 5% broken", "White rice 5% broken", "White rice 15% broken", "White rice 25% broken", "Glutinous rice"],
  },
  {
    match: /coffee/i,
    grades: ["Robusta G1 S18", "Robusta G2 S16", "Robusta G2 5% BB", "Arabica S18", "Arabica S16"],
  },
];

export const MIN_REASONABLE_PRICE_PER_KG = 0.05;
export const MAX_REASONABLE_PRICE_PER_KG = 500;
export const MAX_PRICE_SPREAD_RATIO = 1.35;
const DECIMAL_PRICE = /^\d+(?:\.\d{1,2})?$/;
const DECIMAL_QUANTITY = /^\d+(?:\.\d{1,3})?$/;
const INTEGER_QUANTITY = /^\d+$/;
const MAX_MOQ_QUANTITY = 1_000_000;
const MAX_UNIT_WEIGHT_KG = 2_000;

export function isMoqUnit(value: unknown): value is MoqUnit {
  return typeof value === "string" && (MOQ_UNITS as readonly string[]).includes(value);
}

export function normalizeMoqUnitsConfig(raw: unknown): MoqUnit[] {
  if (!Array.isArray(raw)) return [...MOQ_UNITS];
  const seen = new Set<MoqUnit>();
  const out: MoqUnit[] = [];
  for (const item of raw) {
    const trimmed = typeof item === "string" ? item.trim().toLowerCase() : "";
    if (isMoqUnit(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out.length > 0 ? out : [...MOQ_UNITS];
}

export function allowedMoqUnitsForCategory(category: CategoryGradeSource): MoqUnit[] {
  return normalizeMoqUnitsConfig(category?.moq_units);
}

export function defaultMoqUnitForCategory(category: CategoryGradeSource): MoqUnit {
  const allowed = allowedMoqUnitsForCategory(category);
  if (allowed.includes("mt")) return "mt";
  return allowed[0] ?? "mt";
}

function roundClean(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatQuantityNumber(value: number, maxDecimals = 3): string {
  const rounded = roundClean(value, maxDecimals);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(rounded);
}

export function computeMoqMtEquivalent(
  qty: number | null | undefined,
  unit: MoqUnit | null | undefined,
  unitWeightKg?: number | null,
): number | null {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0 || !unit) return null;
  if (unit === "cont_20ft" || unit === "cont_40ft") return null;
  if (unit === "mt") return roundClean(qty, 4);
  if (unit === "kg") return roundClean(qty / 1000, 4);
  if (unit === "bag" || unit === "carton") {
    if (typeof unitWeightKg !== "number" || !Number.isFinite(unitWeightKg) || unitWeightKg <= 0) return null;
    return roundClean((qty * unitWeightKg) / 1000, 4);
  }
  return null;
}

export function formatStructuredMoqBuyer(
  qty: number | null | undefined,
  unit: MoqUnit | null | undefined,
  unitWeightKg?: number | null,
): string {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0 || !unit) return "";
  const qtyText = formatQuantityNumber(qty, 2);
  if (unit === "kg") return `${qtyText} kg`;
  if (unit === "mt") return `${qtyText} MT`;
  if (unit === "cont_20ft") return `${qtyText} × ${qty === 1 ? "20ft container" : "20ft containers"}`;
  if (unit === "cont_40ft") return `${qtyText} × ${qty === 1 ? "40ft container" : "40ft containers"}`;
  if (unit === "bag" || unit === "carton") {
    if (typeof unitWeightKg !== "number" || !Number.isFinite(unitWeightKg) || unitWeightKg <= 0) return "";
    const mt = computeMoqMtEquivalent(qty, unit, unitWeightKg);
    if (mt === null) return "";
    const mtText = formatQuantityNumber(mt, 3);
    const weightText = formatQuantityNumber(unitWeightKg, 2);
    const noun = unit === "bag"
      ? (qty === 1 ? "bag" : "bags")
      : (qty === 1 ? "carton" : "cartons");
    return `${mtText} MT (${qtyText} × ${weightText} kg ${noun})`;
  }
  return "";
}

export function formatStructuredMoqVi(
  qty: number | null | undefined,
  unit: MoqUnit | null | undefined,
  unitWeightKg?: number | null,
): string {
  if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0 || !unit) return "Theo yêu cầu";
  const qtyText = formatQuantityNumber(qty, 2);
  if (unit === "kg") return `${qtyText} kg`;
  if (unit === "mt") return `${qtyText} tấn`;
  if (unit === "cont_20ft") return `${qtyText} × container 20ft`;
  if (unit === "cont_40ft") return `${qtyText} × container 40ft`;
  if (unit === "bag" || unit === "carton") {
    if (typeof unitWeightKg !== "number" || !Number.isFinite(unitWeightKg) || unitWeightKg <= 0) return "Theo yêu cầu";
    const mt = computeMoqMtEquivalent(qty, unit, unitWeightKg);
    if (mt === null) return "Theo yêu cầu";
    const mtText = formatQuantityNumber(mt, 3);
    const weightText = formatQuantityNumber(unitWeightKg, 2);
    const noun = unit === "bag" ? "bao" : "thùng";
    return `${mtText} tấn (${qtyText} × ${noun} ${weightText} kg)`;
  }
  return "Theo yêu cầu";
}

function parseLocalePositiveNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let normalized = trimmed;
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) {
    normalized = trimmed.replace(/,/g, "");
  } else if (/^\d+,\d{1,3}$/.test(trimmed)) {
    normalized = trimmed.replace(",", ".");
  }
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export type LegacyMoqParseResult =
  | { status: "empty" }
  | {
      status: "converted";
      qty: number;
      unit: MoqUnit;
      unitWeightKg: number | null;
      mtEquivalent: number | null;
      buyerText: string;
      viText: string;
    }
  | {
      status: "needs_review";
      raw: string;
      suggestedQty: number | null;
      suggestedUnit: MoqUnit | null;
      reason: string;
    };

export function parseLegacyMoqString(raw: string | null | undefined): LegacyMoqParseResult {
  const cleaned = cleanText(raw, 180);
  if (!cleaned) return { status: "empty" };
  const lower = cleaned.toLowerCase();
  if (lower === "on request" || lower === "theo yêu cầu" || lower === "theo yeu cau" || lower === "thỏa thuận" || lower === "thoa thuan" || lower === "-") {
    return { status: "empty" };
  }

  // 1. Canonical or explicit bag/carton with weight:
  // "7 MT (280 × 25 kg bags)", "280 × 25 kg bags", "280 bao x 25 kg", "500 thùng x 10kg"
  const canonicalBagCarton = cleaned.match(
    /^(?:[\d.,]+\s*(?:mt|tấn|tan)\s*\(\s*)?(\d+(?:[.,]\d+)?)\s*(?:×|x|\*)\s*(\d+(?:[.,]\d+)?)\s*kgs?\s*(bags?|cartons?|bao|túi|tui|thùng|thung)\s*\)?$/i,
  ) ?? cleaned.match(
    /^(\d+(?:[.,]\d+)?)\s*(bags?|cartons?|bao|túi|tui|thùng|thung)\s*(?:×|x|\*)\s*(\d+(?:[.,]\d+)?)\s*kgs?$/i,
  );
  if (canonicalBagCarton) {
    const isSecondPattern = /^(?:bags?|cartons?|bao|túi|tui|thùng|thung)$/i.test(canonicalBagCarton[2]);
    const qty = parseLocalePositiveNumber(canonicalBagCarton[1]);
    const weight = parseLocalePositiveNumber(isSecondPattern ? canonicalBagCarton[3] : canonicalBagCarton[2]);
    const unitWord = (isSecondPattern ? canonicalBagCarton[2] : canonicalBagCarton[3]).toLowerCase();
    const unit: MoqUnit = /^(?:cartons?|thùng|thung)$/.test(unitWord) ? "carton" : "bag";
    if (qty !== null && Number.isInteger(qty) && weight !== null && weight <= MAX_UNIT_WEIGHT_KG) {
      const mtEquivalent = computeMoqMtEquivalent(qty, unit, weight);
      return {
        status: "converted",
        qty,
        unit,
        unitWeightKg: weight,
        mtEquivalent,
        buyerText: formatStructuredMoqBuyer(qty, unit, weight),
        viText: formatStructuredMoqVi(qty, unit, weight),
      };
    }
  }

  // 2. Containers (20ft / 40ft): e.g. "1 × 20ft container", "1 cont 20ft (~19,2 MT)", "1 x 20ft", "1x40'FCL", "1 x 40HQ"
  const contMatch = cleaned.match(
    /^(\d+)\s*(?:×|x|\*)?\s*(?:cont(?:ainer)?s?\s*)?(20|40)\s*(?:ft|'|hc|hq|rf)?(?:\s*(?:fcl|containers?|cont))?(?:\s*\([^)]*\))?$/i,
  ) ?? cleaned.match(
    /^(\d+)\s*(?:×|x|\*)?\s*(20|40)\s*(?:ft|'|hc|hq)(?:\s*fcl)?(?:\s*containers?)?(?:\s*\([^)]*\))?$/i,
  );
  if (contMatch) {
    const qty = Number(contMatch[1]);
    const size = contMatch[2];
    if (Number.isInteger(qty) && qty > 0 && qty <= 500) {
      const unit: MoqUnit = size === "40" ? "cont_40ft" : "cont_20ft";
      return {
        status: "converted",
        qty,
        unit,
        unitWeightKg: null,
        mtEquivalent: null,
        buyerText: formatStructuredMoqBuyer(qty, unit, null),
        viText: formatStructuredMoqVi(qty, unit, null),
      };
    }
  }

  // 3. Exact weight in metric tons: "1 tấn", "5 tan", "20 MT", "1 metric ton", "2.5 tonnes"
  const mtMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*(mt|tấn|tan|metric\s+tons?|tonnes?|tons?)$/i);
  if (mtMatch) {
    const qty = parseLocalePositiveNumber(mtMatch[1]);
    if (qty !== null && qty <= MAX_MOQ_QUANTITY) {
      const mtEquivalent = computeMoqMtEquivalent(qty, "mt", null);
      return {
        status: "converted",
        qty,
        unit: "mt",
        unitWeightKg: null,
        mtEquivalent,
        buyerText: formatStructuredMoqBuyer(qty, "mt", null),
        viText: formatStructuredMoqVi(qty, "mt", null),
      };
    }
  }

  // 4. Exact weight in kilograms: "27kg", "100kg", "500 kg", "25 kgs"
  const kgMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*(kgs?|kilograms?)$/i);
  if (kgMatch) {
    const qty = parseLocalePositiveNumber(kgMatch[1]);
    if (qty !== null && qty <= MAX_MOQ_QUANTITY) {
      const mtEquivalent = computeMoqMtEquivalent(qty, "kg", null);
      return {
        status: "converted",
        qty,
        unit: "kg",
        unitWeightKg: null,
        mtEquivalent,
        buyerText: formatStructuredMoqBuyer(qty, "kg", null),
        viText: formatStructuredMoqVi(qty, "kg", null),
      };
    }
  }

  // 5. Bag / pouch without unit weight: e.g. "280 Túi", "280 bao", "100 bags"
  const bagNoWeight = cleaned.match(/^(\d+)\s*(bao|túi|tui|bags?|pouches?|sacks?)$/i);
  if (bagNoWeight) {
    const qty = Number(bagNoWeight[1]);
    return {
      status: "needs_review",
      raw: cleaned,
      suggestedQty: Number.isInteger(qty) && qty > 0 ? qty : null,
      suggestedUnit: "bag",
      reason: "Thiếu trọng lượng mỗi bao (kg)",
    };
  }

  // 6. Carton / box without unit weight: e.g. "500 thùng", "200 cartons"
  const cartonNoWeight = cleaned.match(/^(\d+)\s*(thùng|thung|cartons?|boxes?|hộp|hop)$/i);
  if (cartonNoWeight) {
    const qty = Number(cartonNoWeight[1]);
    return {
      status: "needs_review",
      raw: cleaned,
      suggestedQty: Number.isInteger(qty) && qty > 0 ? qty : null,
      suggestedUnit: "carton",
      reason: "Thiếu trọng lượng mỗi thùng (kg)",
    };
  }

  return {
    status: "needs_review",
    raw: cleaned,
    suggestedQty: null,
    suggestedUnit: null,
    reason: "Đơn vị chưa nằm trong danh sách chuẩn (kg, tấn, bao, thùng, container 20ft/40ft)",
  };
}

export function classifyMoqFilterGroup(input: {
  moqUnit?: MoqUnit | string | null;
  moqMtEquivalent?: number | null;
  moqText?: string | null;
}): "small" | "medium" | "large" | "container" | "ask" {
  const unit = input.moqUnit;
  if (unit === "cont_20ft" || unit === "cont_40ft") return "container";
  if (typeof input.moqMtEquivalent === "number" && Number.isFinite(input.moqMtEquivalent) && input.moqMtEquivalent > 0) {
    if (input.moqMtEquivalent <= 1) return "small";
    if (input.moqMtEquivalent <= 5) return "medium";
    return "large";
  }

  const text = (input.moqText ?? "").trim();
  if (!text) return "ask";
  const parsed = parseLegacyMoqString(text);
  if (parsed.status === "converted") {
    if (parsed.unit === "cont_20ft" || parsed.unit === "cont_40ft") return "container";
    if (parsed.mtEquivalent !== null && parsed.mtEquivalent > 0) {
      if (parsed.mtEquivalent <= 1) return "small";
      if (parsed.mtEquivalent <= 5) return "medium";
      return "large";
    }
  }

  const lower = text.toLowerCase();
  if (/fcl|container|\bcont\b|(?:20|40)\s*(?:ft|'|hc|hq)/.test(lower)) return "container";
  const quantity = /([\d.,]+)\s*(kg|metric\s+tons?|tons?|tonnes?|mt|t)\b/i.exec(lower);
  if (!quantity) return "ask";
  const number = Number(quantity[1].replace(/,/g, ""));
  if (!Number.isFinite(number) || number <= 0) return "ask";
  const tons = quantity[2].toLowerCase() === "kg" ? number / 1000 : number;
  return tons <= 1 ? "small" : tons <= 5 ? "medium" : "large";
}

export function parseLeadTimeInput(input: {
  valueRaw?: unknown;
  unitRaw?: unknown;
  legacyDaysRaw?: unknown;
}):
  | { ok: true; value: number | null; unit: LeadTimeUnit; daysEquivalent: number | null }
  | { ok: false; message: string } {
  const rawUnitStr = typeof input.unitRaw === "string" ? input.unitRaw.trim().toLowerCase() : "";
  if (rawUnitStr === "on_request") {
    return { ok: true, value: null, unit: "on_request", daysEquivalent: null };
  }
  if (rawUnitStr === "days" || rawUnitStr === "weeks") {
    const valStr = input.valueRaw == null ? "" : String(input.valueRaw).trim();
    if (!valStr) {
      return { ok: true, value: null, unit: "on_request", daysEquivalent: null };
    }
    const maxVal = rawUnitStr === "weeks" ? 52 : 365;
    if (!INTEGER_QUANTITY.test(valStr)) {
      return { ok: false, message: "Thời gian giao hàng phải là số nguyên dương." };
    }
    const num = Number(valStr);
    if (!Number.isFinite(num) || num <= 0 || num > maxVal) {
      return {
        ok: false,
        message: rawUnitStr === "weeks"
          ? "Thời gian giao hàng theo tuần phải từ 1 đến 52 tuần."
          : "Thời gian giao hàng theo ngày phải từ 1 đến 365 ngày.",
      };
    }
    return {
      ok: true,
      value: num,
      unit: rawUnitStr,
      daysEquivalent: rawUnitStr === "weeks" ? num * 7 : num,
    };
  }

  const legacyStr = input.legacyDaysRaw == null ? "" : String(input.legacyDaysRaw).trim();
  if (!legacyStr || legacyStr === "0") {
    return { ok: true, value: null, unit: "on_request", daysEquivalent: null };
  }
  if (!INTEGER_QUANTITY.test(legacyStr) || Number(legacyStr) > 3650) {
    return { ok: false, message: "Thời gian giao hàng không hợp lệ." };
  }
  const days = Number(legacyStr);
  return { ok: true, value: days, unit: "days", daysEquivalent: days };
}

export function readProductLeadTime(
  product: Pick<SupplierProduct, "lead_time_days" | "specs"> | null | undefined,
): { value: number | null; unit: LeadTimeUnit; daysEquivalent: number | null } {
  const rawSpec = product?.specs && typeof product.specs === "object"
    ? (product.specs as Record<string, unknown>).lead_time
    : null;
  if (rawSpec && typeof rawSpec === "object") {
    const rec = rawSpec as Record<string, unknown>;
    const unit = rec.unit === "days" || rec.unit === "weeks" || rec.unit === "on_request" ? rec.unit : null;
    const value = typeof rec.value === "number" && Number.isFinite(rec.value) && rec.value > 0 ? Math.round(rec.value) : null;
    if (unit === "on_request") return { value: null, unit: "on_request", daysEquivalent: null };
    if ((unit === "days" || unit === "weeks") && value !== null) {
      return { value, unit, daysEquivalent: unit === "weeks" ? value * 7 : value };
    }
  }
  if (typeof product?.lead_time_days === "number" && Number.isFinite(product.lead_time_days) && product.lead_time_days > 0) {
    return { value: product.lead_time_days, unit: "days", daysEquivalent: product.lead_time_days };
  }
  return { value: null, unit: "on_request", daysEquivalent: null };
}

export function applyLeadTimeToSpecs(
  baseSpecs: Record<string, unknown>,
  leadTime: { value: number | null; unit: LeadTimeUnit },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...baseSpecs };
  if (leadTime.unit === "on_request" || leadTime.value === null) {
    next.lead_time = { value: null, unit: "on_request" };
  } else {
    next.lead_time = { value: leadTime.value, unit: leadTime.unit };
  }
  return next;
}

export function formatLeadTimeVi(
  product: Pick<SupplierProduct, "lead_time_days" | "specs"> | null | undefined,
): string {
  const lt = readProductLeadTime(product);
  if (lt.unit === "weeks" && lt.value !== null) return `${lt.value} tuần`;
  if (lt.unit === "days" && lt.value !== null) return `${lt.value} ngày`;
  return "Theo yêu cầu";
}

export function formatLeadTimeBuyer(
  product: Pick<SupplierProduct, "lead_time_days" | "specs"> | null | undefined,
): string {
  const lt = readProductLeadTime(product);
  if (lt.unit === "weeks" && lt.value !== null) return lt.value === 1 ? "1 week" : `${lt.value} weeks`;
  if (lt.unit === "days" && lt.value !== null) return lt.value === 1 ? "1 day" : `${lt.value} days`;
  return "On request";
}

export function formatProductMoqVi(
  product: Pick<SupplierProduct, "moq" | "moq_qty" | "moq_unit" | "specs"> | null | undefined,
): string {
  if (!product) return "-";
  const rows = readStoredGradeRows(product.specs);
  for (const row of rows) {
    if (row.moq_qty && row.moq_unit) {
      return formatStructuredMoqVi(row.moq_qty, row.moq_unit, row.moq_unit_weight_kg);
    }
    if (row.moq) {
      const parsed = parseLegacyMoqString(row.moq);
      if (parsed.status === "converted") return parsed.viText;
      return row.moq;
    }
  }
  const specWeight = product.specs && typeof product.specs === "object" && typeof (product.specs as Record<string, unknown>).moq_unit_weight_kg === "number"
    ? ((product.specs as Record<string, unknown>).moq_unit_weight_kg as number)
    : null;
  if (typeof product.moq_qty === "number" && product.moq_qty > 0 && isMoqUnit(product.moq_unit)) {
    return formatStructuredMoqVi(product.moq_qty, product.moq_unit, specWeight);
  }
  if (product.moq) {
    const parsed = parseLegacyMoqString(product.moq);
    if (parsed.status === "converted") return parsed.viText;
    return product.moq;
  }
  return "Theo yêu cầu";
}

export function auditProductStructuredUnits(
  product: Pick<SupplierProduct, "moq" | "moq_qty" | "moq_unit" | "ref_price" | "ref_price_max" | "unit" | "currency" | "specs">,
  category?: CategoryGradeSource,
): { needsReview: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const storedRows = readStoredGradeRows(product.specs);

  if (storedRows.length > 0) {
    for (let i = 0; i < storedRows.length; i += 1) {
      const row = storedRows[i];
      if (!row.moq_qty && row.moq) {
        const parsed = parseLegacyMoqString(row.moq);
        if (parsed.status === "needs_review") {
          reasons.push(`Dòng ${row.grade}: MOQ '${row.moq}' - ${parsed.reason}`);
        }
      }
      if ((row.moq_unit === "bag" || row.moq_unit === "carton") && (!row.moq_unit_weight_kg || row.moq_unit_weight_kg <= 0)) {
        reasons.push(`Dòng ${row.grade}: thiếu trọng lượng mỗi ${row.moq_unit === "bag" ? "bao" : "thùng"} (kg)`);
      }
    }
  } else if (!(typeof product.moq_qty === "number" && product.moq_qty > 0 && isMoqUnit(product.moq_unit))) {
    const parsed = parseLegacyMoqString(product.moq);
    if (parsed.status === "needs_review") {
      reasons.push(`MOQ '${parsed.raw}': ${parsed.reason}`);
    }
  }

  if (storedRows.length === 0 && typeof product.ref_price === "number" && product.ref_price > 0) {
    const parsedUnit = parsePriceUnit(product.unit, product.currency);
    if (!parsedUnit) {
      const rawUnit = cleanText(product.unit, 40) || cleanText(product.currency, 40) || "chưa rõ";
      reasons.push(`Đơn vị giá cũ '${rawUnit}' không tự quy đổi sang đơn vị chuẩn của danh mục`);
    } else {
      const unitMeta = categoryMarketPriceUnit(category?.slug, category?.price_unit);
      const minKg = toPricePerKg(product.ref_price, parsedUnit);
      const maxVal = typeof product.ref_price_max === "number" && product.ref_price_max >= product.ref_price
        ? product.ref_price_max
        : product.ref_price;
      const maxKg = toPricePerKg(maxVal, parsedUnit);
      if (minKg !== null && maxKg !== null && (minKg < MIN_REASONABLE_PRICE_PER_KG || maxKg > MAX_REASONABLE_PRICE_PER_KG)) {
        reasons.push(`Giá tham khảo ngoài ngưỡng hợp lý khi quy đổi sang ${unitMeta.unitLabel}`);
      }
    }
  }

  return { needsReview: reasons.length > 0, reasons };
}

export function isGradeFieldKey(key: string | null | undefined): boolean {
  const normalized = (key ?? "").trim().toLowerCase();
  return normalized === "grade" || normalized === "product_type";
}

export function primaryGradeFieldKey(category: CategoryGradeSource): "grade" | "product_type" {
  const fields = Array.isArray(category?.product_fields) ? category!.product_fields! : [];
  if (fields.some((f) => f?.key === "product_type")) return "product_type";
  return "grade";
}

export function nonGradeProductFields<T extends Pick<ProductAttributeField, "key">>(fields: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(fields)) return [];
  return fields.filter((field) => !isGradeFieldKey(field.key));
}

/**
 * Danh sách grade chuẩn theo danh mục.
 * Kết hợp danh sách chuẩn theo ngành hàng với các tùy chọn CMS khai trong product_fields
 * để đổi danh mục là danh sách grade tự cập nhật theo.
 */
export function standardGradesForCategory(category: CategoryGradeSource): string[] {
  const slug = (category?.slug ?? "").trim().toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const key = gradeKey(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  };

  for (const entry of BUILTIN_CATEGORY_GRADES) {
    if (slug && entry.match.test(slug)) {
      for (const option of entry.grades) push(option);
      break;
    }
  }

  const fields = Array.isArray(category?.product_fields) ? category!.product_fields! : [];
  for (const field of fields) {
    if (!field || !isGradeFieldKey(field.key) || !Array.isArray(field.options)) continue;
    for (const option of field.options) push(option);
  }

  return result;
}

export function matchStandardGrade(value: string | null | undefined, standardGrades: readonly string[]): string | null {
  if (!value) return null;
  const key = gradeKey(value);
  if (!key) return null;
  return standardGrades.find((option) => gradeKey(option) === key) ?? null;
}

export function categoryMarketPriceUnit(
  categorySlug: string | null | undefined,
  configuredUnit?: string | null,
): CategoryPriceUnitMeta {
  const slug = (categorySlug ?? "").trim();
  const units = displayUnitsForCategory(slug, configuredUnit ?? null);
  const isMt = units.primary === "mt";
  return {
    primary: isMt ? "mt" : "kg",
    tradeUnit: isMt ? "MT" : "kg",
    unitLabel: isMt ? "USD/MT" : "USD/kg",
    headerLabel: isMt ? "GIÁ (USD/MT)" : "GIÁ (USD/KG)",
  };
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeIncoterm(value: unknown): GradeIncoterm {
  const upper = cleanText(value, 16).toUpperCase();
  return (GRADE_INCOTERMS as readonly string[]).includes(upper) ? (upper as GradeIncoterm) : "FOB";
}

function stringAttributesOnly(specs: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!specs) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function formatDraftNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === "string" && DECIMAL_QUANTITY.test(value.trim()) && Number(value.trim()) > 0) return value.trim();
  return "";
}

function hydrateMoqDraftFields(
  input: {
    moq?: string | null;
    moq_qty?: number | null;
    moq_unit?: unknown;
    moq_unit_weight_kg?: number | null;
  },
  category: CategoryGradeSource,
): Pick<ProductGradeRowDraft, "moq" | "moqQty" | "moqUnit" | "moqUnitWeightKg" | "moqLegacyRaw"> {
  const fallbackUnit = defaultMoqUnitForCategory(category);
  if (typeof input.moq_qty === "number" && Number.isFinite(input.moq_qty) && input.moq_qty > 0 && isMoqUnit(input.moq_unit)) {
    const unitWeight = typeof input.moq_unit_weight_kg === "number" && Number.isFinite(input.moq_unit_weight_kg) && input.moq_unit_weight_kg > 0
      ? input.moq_unit_weight_kg
      : null;
    const buyerText = formatStructuredMoqBuyer(input.moq_qty, input.moq_unit, unitWeight) || cleanText(input.moq, 180);
    return {
      moq: buyerText,
      moqQty: formatDraftNumber(input.moq_qty),
      moqUnit: input.moq_unit,
      moqUnitWeightKg: formatDraftNumber(unitWeight),
      moqLegacyRaw: "",
    };
  }

  const parsed = parseLegacyMoqString(input.moq);
  if (parsed.status === "empty") {
    return {
      moq: "",
      moqQty: "",
      moqUnit: fallbackUnit,
      moqUnitWeightKg: "",
      moqLegacyRaw: "",
    };
  }
  if (parsed.status === "converted") {
    return {
      moq: parsed.buyerText,
      moqQty: formatDraftNumber(parsed.qty),
      moqUnit: parsed.unit,
      moqUnitWeightKg: formatDraftNumber(parsed.unitWeightKg),
      moqLegacyRaw: "",
    };
  }
  return {
    moq: parsed.raw,
    moqQty: parsed.suggestedQty !== null ? String(parsed.suggestedQty) : "",
    moqUnit: parsed.suggestedUnit ?? fallbackUnit,
    moqUnitWeightKg: "",
    moqLegacyRaw: parsed.raw,
  };
}

export function createEmptyGradeRowDraft(id = "row-1", category?: CategoryGradeSource): ProductGradeRowDraft {
  return {
    id,
    selectedGrade: "",
    customGrade: "",
    priceMin: "",
    priceMax: "",
    incoterm: "FOB",
    moq: "",
    moqQty: "",
    moqUnit: defaultMoqUnitForCategory(category),
    moqUnitWeightKg: "",
    moqLegacyRaw: "",
  };
}

/**
 * Đọc bảng grade_rows đã lưu trong specs (nếu có), giữ nguyên cả dòng tự nhập và dữ liệu MOQ chuẩn.
 */
export function readStoredGradeRows(specs: Record<string, unknown> | null | undefined): ProductGradeRow[] {
  if (!specs || typeof specs !== "object" || !Array.isArray(specs.grade_rows)) return [];
  const rows: ProductGradeRow[] = [];
  for (const item of specs.grade_rows.slice(0, MAX_GRADE_ROWS)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const grade = cleanText(rec.grade, 80);
    if (!grade) continue;
    const min = typeof rec.price_min === "number" && Number.isFinite(rec.price_min) && rec.price_min > 0 ? rec.price_min : null;
    const max = typeof rec.price_max === "number" && Number.isFinite(rec.price_max) && rec.price_max > 0 ? rec.price_max : null;
    const validPair = min !== null && max !== null && max >= min;

    const moqQty = typeof rec.moq_qty === "number" && Number.isFinite(rec.moq_qty) && rec.moq_qty > 0 ? rec.moq_qty : null;
    const moqUnit = isMoqUnit(rec.moq_unit) ? rec.moq_unit : null;
    const moqUnitWeightKg = typeof rec.moq_unit_weight_kg === "number" && Number.isFinite(rec.moq_unit_weight_kg) && rec.moq_unit_weight_kg > 0
      ? rec.moq_unit_weight_kg
      : null;
    const computedMt = moqQty && moqUnit ? computeMoqMtEquivalent(moqQty, moqUnit, moqUnitWeightKg) : null;
    const canonicalMoq = moqQty && moqUnit
      ? (formatStructuredMoqBuyer(moqQty, moqUnit, moqUnitWeightKg) || cleanText(rec.moq, 180))
      : cleanText(rec.moq, 180);

    rows.push({
      grade,
      is_custom: Boolean(rec.is_custom),
      price_min: validPair ? min : null,
      price_max: validPair ? max : null,
      incoterm: normalizeIncoterm(rec.incoterm),
      moq: canonicalMoq,
      moq_qty: moqQty && moqUnit ? moqQty : null,
      moq_unit: moqQty && moqUnit ? moqUnit : null,
      moq_unit_weight_kg: moqQty && (moqUnit === "bag" || moqUnit === "carton") ? moqUnitWeightKg : null,
      moq_mt_equivalent: computedMt,
    });
  }
  return rows;
}

/**
 * Khởi tạo danh sách dòng cho form Supplier Portal và CRM.
 * Sản phẩm cũ chưa có specs.grade_rows được chuyển mượt thành bảng 1 dòng.
 */
export function hydrateGradeRowsDraft(
  product: Pick<SupplierProduct, "name" | "spec" | "category" | "supplier_category_proposal" | "reviewed_category_slug" | "specs" | "ref_price" | "ref_price_max" | "currency" | "unit" | "incoterm" | "moq" | "moq_qty" | "moq_unit"> | null | undefined,
  category: CategoryGradeSource,
): ProductGradeRowDraft[] {
  if (!product) return [createEmptyGradeRowDraft("row-1", category)];

  const standardGrades = standardGradesForCategory(category);
  const stored = readStoredGradeRows(product.specs);
  if (stored.length > 0) {
    return stored.slice(0, MAX_GRADE_ROWS).map((row, index) => {
      const matched = !row.is_custom ? matchStandardGrade(row.grade, standardGrades) : null;
      const isCustom = row.is_custom || (!matched && standardGrades.length > 0);
      const moqDraft = hydrateMoqDraftFields(row, category);
      return {
        id: `row-${index + 1}`,
        selectedGrade: isCustom ? CUSTOM_GRADE_OPTION : (matched ?? row.grade),
        customGrade: isCustom ? row.grade : "",
        priceMin: formatDraftNumber(row.price_min),
        priceMax: formatDraftNumber(row.price_max),
        incoterm: normalizeIncoterm(row.incoterm),
        ...moqDraft,
      };
    });
  }

  // Legacy single-grade fallback: convert existing scalar price into the category market unit when possible.
  const slug = category?.slug ?? product.reviewed_category_slug ?? product.supplier_category_proposal ?? product.category ?? "";
  const unitMeta = categoryMarketPriceUnit(slug, category?.price_unit);
  const resolved = resolveGrade({
    name: product.name,
    spec: product.spec,
    categorySlug: slug,
    attributes: stringAttributesOnly(product.specs),
  });
  const rawAttrGrade = cleanText(product.specs?.grade ?? product.specs?.product_type, 80);
  const legacyGrade = rawAttrGrade || resolved.value || "";
  const matched = legacyGrade ? matchStandardGrade(legacyGrade, standardGrades) : null;

  let minVal: number | null = typeof product.ref_price === "number" && product.ref_price > 0 ? product.ref_price : null;
  let maxVal: number | null = typeof product.ref_price_max === "number" && product.ref_price_max >= (minVal ?? 0) && minVal !== null
    ? product.ref_price_max
    : minVal;

  if (minVal !== null && maxVal !== null) {
    const parsedSourceUnit = parsePriceUnit(product.unit, product.currency);
    if (!parsedSourceUnit) {
      // Do not silently copy a price tied to an unknown legacy unit (e.g. "Bag", "thùng") into USD/kg or USD/MT.
      minVal = null;
      maxVal = null;
    } else if (parsedSourceUnit !== unitMeta.primary && (product.currency ?? "USD").toUpperCase().startsWith("USD")) {
      const lowKg = toPricePerKg(minVal, parsedSourceUnit);
      const highKg = toPricePerKg(maxVal, parsedSourceUnit);
      if (lowKg !== null && highKg !== null) {
        const factor = unitMeta.primary === "mt" ? 1 : 100;
        minVal = Math.round(fromPricePerKg(lowKg, unitMeta.primary) * factor) / factor;
        maxVal = Math.round(fromPricePerKg(highKg, unitMeta.primary) * factor) / factor;
      }
    }
  }

  const specWeight = product.specs && typeof product.specs === "object" && typeof (product.specs as Record<string, unknown>).moq_unit_weight_kg === "number"
    ? ((product.specs as Record<string, unknown>).moq_unit_weight_kg as number)
    : null;
  const moqDraft = hydrateMoqDraftFields(
    {
      moq: product.moq,
      moq_qty: product.moq_qty,
      moq_unit: product.moq_unit,
      moq_unit_weight_kg: specWeight,
    },
    category,
  );

  const hasCustomLegacy = Boolean(legacyGrade && !matched);
  return [{
    id: "row-1",
    selectedGrade: matched ? matched : hasCustomLegacy ? CUSTOM_GRADE_OPTION : "",
    customGrade: hasCustomLegacy ? legacyGrade : "",
    priceMin: formatDraftNumber(minVal),
    priceMax: formatDraftNumber(maxVal),
    incoterm: normalizeIncoterm(product.incoterm),
    ...moqDraft,
  }];
}

/**
 * Khi đổi danh mục: giữ các dòng tự nhập, khớp lại grade chuẩn nếu trùng tên,
 * đặt lại về "Chọn grade" nếu grade cũ không thuộc danh mục mới, và đồng bộ đơn vị MOQ cho phép.
 */
export function reconcileGradeRowsForCategory(
  rows: readonly ProductGradeRowDraft[],
  category: CategoryGradeSource,
): ProductGradeRowDraft[] {
  const standardGrades = standardGradesForCategory(category);
  const allowedUnits = allowedMoqUnitsForCategory(category);
  const fallbackUnit = defaultMoqUnitForCategory(category);
  return rows.map((row) => {
    let nextSelected = row.selectedGrade;
    if (row.selectedGrade && row.selectedGrade !== CUSTOM_GRADE_OPTION) {
      const matched = matchStandardGrade(row.selectedGrade, standardGrades);
      nextSelected = matched ?? "";
    }
    const currentUnit = row.moqUnit;
    const nextUnit = currentUnit && allowedUnits.includes(currentUnit)
      ? currentUnit
      : currentUnit === undefined
        ? undefined
        : fallbackUnit;
    const clearWeight = nextUnit && nextUnit !== "bag" && nextUnit !== "carton";
    if (nextSelected === row.selectedGrade && nextUnit === row.moqUnit && !clearWeight) return row;
    return {
      ...row,
      selectedGrade: nextSelected,
      ...(nextUnit !== undefined ? { moqUnit: nextUnit } : {}),
      ...(clearWeight ? { moqUnitWeightKg: "" } : {}),
    };
  });
}

function validateReasonableConvertedPrice(
  parsedMin: number,
  parsedMax: number,
  unitMeta: CategoryPriceUnitMeta,
): string | null {
  const minPerKg = toPricePerKg(parsedMin, unitMeta.primary);
  const maxPerKg = toPricePerKg(parsedMax, unitMeta.primary);
  if (minPerKg === null || maxPerKg === null) {
    return "Đơn vị giá danh mục không hợp lệ.";
  }
  if (minPerKg < MIN_REASONABLE_PRICE_PER_KG) {
    return unitMeta.primary === "mt"
      ? "Giá thấp bất thường cho đơn vị USD/MT (tối thiểu 50 USD/MT). Kiểm tra xem bạn có đang nhập nhầm giá theo kg không."
      : "Giá thấp bất thường cho đơn vị USD/kg (tối thiểu 0.05 USD/kg).";
  }
  if (maxPerKg > MAX_REASONABLE_PRICE_PER_KG) {
    return unitMeta.primary === "kg"
      ? "Giá cao bất thường cho đơn vị USD/kg (tối đa 500 USD/kg). Kiểm tra xem bạn có đang nhập nhầm giá theo tấn hoặc VNĐ không."
      : "Giá cao bất thường cho đơn vị USD/MT (tối đa 500,000 USD/MT). Kiểm tra xem bạn có đang nhập nhầm sang VNĐ không.";
  }
  if (exceedsMaxPriceSpread(parsedMin, parsedMax)) {
    return "Khoảng giá tối đa không vượt quá 1,35 lần giá từ.";
  }
  return null;
}

function validateMoqFromDraft(
  row: ProductGradeRowDraft,
  category: CategoryGradeSource,
): {
  error: string | null;
  moq: string;
  moq_qty: number | null;
  moq_unit: MoqUnit | null;
  moq_unit_weight_kg: number | null;
  moq_mt_equivalent: number | null;
} {
  const allowedUnits = allowedMoqUnitsForCategory(category);
  const hasStructuredFields = row.moqQty !== undefined || row.moqUnit !== undefined || row.moqUnitWeightKg !== undefined || row.moqLegacyRaw !== undefined;

  if (!hasStructuredFields) {
    const raw = cleanText(row.moq, 180);
    if (!raw) {
      return { error: null, moq: "", moq_qty: null, moq_unit: null, moq_unit_weight_kg: null, moq_mt_equivalent: null };
    }
    const parsed = parseLegacyMoqString(raw);
    if (parsed.status === "empty") {
      return { error: null, moq: "", moq_qty: null, moq_unit: null, moq_unit_weight_kg: null, moq_mt_equivalent: null };
    }
    if (parsed.status === "converted") {
      if (!allowedUnits.includes(parsed.unit)) {
        return {
          error: "Đơn vị MOQ này không nằm trong danh sách cho phép của danh mục.",
          moq: "",
          moq_qty: null,
          moq_unit: null,
          moq_unit_weight_kg: null,
          moq_mt_equivalent: null,
        };
      }
      return {
        error: null,
        moq: parsed.buyerText,
        moq_qty: parsed.qty,
        moq_unit: parsed.unit,
        moq_unit_weight_kg: parsed.unitWeightKg,
        moq_mt_equivalent: parsed.mtEquivalent,
      };
    }
    return {
      error: `MOQ '${parsed.raw}' chưa đủ thông tin: ${parsed.reason}.`,
      moq: "",
      moq_qty: null,
      moq_unit: null,
      moq_unit_weight_kg: null,
      moq_mt_equivalent: null,
    };
  }

  const qtyRaw = (row.moqQty ?? "").trim();
  const unit: MoqUnit = isMoqUnit(row.moqUnit) ? row.moqUnit : defaultMoqUnitForCategory(category);
  const weightRaw = (row.moqUnitWeightKg ?? "").trim();
  const legacyRaw = cleanText(row.moqLegacyRaw, 180);

  if (!qtyRaw) {
    if (legacyRaw) {
      return {
        error: `MOQ cũ ('${legacyRaw}') chưa chuẩn. Nhập lại số lượng và chọn đơn vị chuẩn, hoặc xóa để chuyển sang Theo yêu cầu.`,
        moq: "",
        moq_qty: null,
        moq_unit: null,
        moq_unit_weight_kg: null,
        moq_mt_equivalent: null,
      };
    }
    if ((unit === "bag" || unit === "carton") && weightRaw) {
      return {
        error: `Nhập số lượng ${unit === "bag" ? "bao" : "thùng"} cho MOQ hoặc xóa trọng lượng.`,
        moq: "",
        moq_qty: null,
        moq_unit: null,
        moq_unit_weight_kg: null,
        moq_mt_equivalent: null,
      };
    }
    return { error: null, moq: "", moq_qty: null, moq_unit: null, moq_unit_weight_kg: null, moq_mt_equivalent: null };
  }

  if (!allowedUnits.includes(unit)) {
    return {
      error: "Đơn vị MOQ này không nằm trong danh sách cho phép của danh mục.",
      moq: "",
      moq_qty: null,
      moq_unit: null,
      moq_unit_weight_kg: null,
      moq_mt_equivalent: null,
    };
  }

  const requiresInteger = unit === "bag" || unit === "carton" || unit === "cont_20ft" || unit === "cont_40ft";
  if (requiresInteger ? !INTEGER_QUANTITY.test(qtyRaw) : !DECIMAL_QUANTITY.test(qtyRaw)) {
    return {
      error: requiresInteger
        ? "Số lượng bao, thùng hoặc container phải là số nguyên dương."
        : "Số lượng MOQ phải là số lớn hơn 0 (tối đa 3 chữ số thập phân).",
      moq: "",
      moq_qty: null,
      moq_unit: null,
      moq_unit_weight_kg: null,
      moq_mt_equivalent: null,
    };
  }
  const qty = Number(qtyRaw);
  const maxQty = unit === "cont_20ft" || unit === "cont_40ft" ? 500 : MAX_MOQ_QUANTITY;
  if (!Number.isFinite(qty) || qty <= 0 || qty > maxQty) {
    return {
      error: "Số lượng MOQ vượt ngoài phạm vi hợp lệ.",
      moq: "",
      moq_qty: null,
      moq_unit: null,
      moq_unit_weight_kg: null,
      moq_mt_equivalent: null,
    };
  }

  let unitWeightKg: number | null = null;
  if (unit === "bag" || unit === "carton") {
    const nounVi = unit === "bag" ? "bao" : "thùng";
    if (!weightRaw || !DECIMAL_QUANTITY.test(weightRaw)) {
      return {
        error: `Nhập trọng lượng mỗi ${nounVi} (kg).`,
        moq: "",
        moq_qty: null,
        moq_unit: null,
        moq_unit_weight_kg: null,
        moq_mt_equivalent: null,
      };
    }
    const parsedWeight = Number(weightRaw);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > MAX_UNIT_WEIGHT_KG) {
      return {
        error: `Trọng lượng mỗi ${nounVi} phải từ 0.1 đến ${MAX_UNIT_WEIGHT_KG} kg.`,
        moq: "",
        moq_qty: null,
        moq_unit: null,
        moq_unit_weight_kg: null,
        moq_mt_equivalent: null,
      };
    }
    unitWeightKg = parsedWeight;
  }

  const mtEquivalent = computeMoqMtEquivalent(qty, unit, unitWeightKg);
  const buyerText = formatStructuredMoqBuyer(qty, unit, unitWeightKg);
  return {
    error: null,
    moq: buyerText,
    moq_qty: qty,
    moq_unit: unit,
    moq_unit_weight_kg: unitWeightKg,
    moq_mt_equivalent: mtEquivalent,
  };
}

export function validateGradeRowDraft(
  row: ProductGradeRowDraft,
  category: CategoryGradeSource,
): ProductGradeRowValidation {
  const standardGrades = standardGradesForCategory(category);
  const unitMeta = categoryMarketPriceUnit(category?.slug, category?.price_unit);
  const isCustom = row.selectedGrade === CUSTOM_GRADE_OPTION;
  let grade = "";
  let gradeError: string | null = null;

  if (!row.selectedGrade) {
    gradeError = "Chọn grade cho dòng này.";
  } else if (isCustom) {
    grade = cleanText(row.customGrade, 80);
    if (!grade) gradeError = "Nhập tên grade cho dòng này.";
  } else {
    const matched = standardGrades.length > 0 ? matchStandardGrade(row.selectedGrade, standardGrades) : cleanText(row.selectedGrade, 80);
    if (!matched) {
      gradeError = "Chọn grade cho dòng này.";
    } else {
      grade = matched;
    }
  }

  const minRaw = row.priceMin.trim();
  const maxRaw = row.priceMax.trim();
  let priceMin: number | null = null;
  let priceMax: number | null = null;
  let priceError: string | null = null;

  if (minRaw !== "" || maxRaw !== "") {
    if (minRaw === "" || maxRaw === "" || !DECIMAL_PRICE.test(minRaw) || !DECIMAL_PRICE.test(maxRaw)) {
      priceError = "Nhập đủ giá từ và đến, hoặc để trống cả hai.";
    } else {
      const parsedMin = Number(minRaw);
      const parsedMax = Number(maxRaw);
      if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax) || parsedMin <= 0 || parsedMax <= 0 || parsedMax < parsedMin) {
        priceError = "Giá đến phải lớn hơn hoặc bằng giá từ và lớn hơn 0.";
      } else {
        const reasonableErr = validateReasonableConvertedPrice(parsedMin, parsedMax, unitMeta);
        if (reasonableErr) {
          priceError = reasonableErr;
        } else {
          priceMin = parsedMin;
          priceMax = parsedMax;
        }
      }
    }
  }

  const incotermRaw = cleanText(row.incoterm, 16).toUpperCase() || "FOB";
  const incotermValid = (GRADE_INCOTERMS as readonly string[]).includes(incotermRaw);
  const incotermError = incotermValid ? null : "Chọn Incoterm hợp lệ.";

  const moqResult = validateMoqFromDraft(row, category);
  const moqError = moqResult.error;
  const valid = !gradeError && !priceError && !incotermError && !moqError;

  return {
    gradeError,
    priceError,
    incotermError,
    moqError,
    valid,
    normalized: valid
      ? {
          grade,
          is_custom: isCustom,
          price_min: priceMin,
          price_max: priceMax,
          incoterm: incotermRaw,
          moq: moqResult.moq,
          moq_qty: moqResult.moq_qty,
          moq_unit: moqResult.moq_unit,
          moq_unit_weight_kg: moqResult.moq_unit_weight_kg,
          moq_mt_equivalent: moqResult.moq_mt_equivalent,
        }
      : null,
  };
}

export function validateGradeRowsDraft(
  rows: readonly ProductGradeRowDraft[],
  category: CategoryGradeSource,
): {
  valid: boolean;
  message: string | null;
  rowResults: ProductGradeRowValidation[];
  rows: ProductGradeRow[];
} {
  if (!Array.isArray(rows) || rows.length < MIN_GRADE_ROWS) {
    return { valid: false, message: "Cần ít nhất 1 dòng grade trong bảng Grade & giá.", rowResults: [], rows: [] };
  }
  if (rows.length > MAX_GRADE_ROWS) {
    return { valid: false, message: `Bảng Grade & giá tối đa ${MAX_GRADE_ROWS} dòng.`, rowResults: [], rows: [] };
  }
  const rowResults = rows.map((row) => validateGradeRowDraft(row, category));
  const firstBadIndex = rowResults.findIndex((item) => !item.valid);
  if (firstBadIndex !== -1) {
    const bad = rowResults[firstBadIndex];
    const reason = bad.gradeError || bad.priceError || bad.incotermError || bad.moqError || "Kiểm tra lại thông tin dòng grade.";
    return {
      valid: false,
      message: `Dòng grade ${firstBadIndex + 1}: ${reason}`,
      rowResults,
      rows: [],
    };
  }
  return {
    valid: true,
    message: null,
    rowResults,
    rows: rowResults.map((item) => item.normalized!),
  };
}

export function serializeGradeRowsDraft(rows: readonly ProductGradeRowDraft[]): string {
  return JSON.stringify(
    rows.slice(0, MAX_GRADE_ROWS).map((row) => ({
      selectedGrade: row.selectedGrade,
      customGrade: row.customGrade,
      priceMin: row.priceMin,
      priceMax: row.priceMax,
      incoterm: row.incoterm,
      moq: row.moq,
      ...(row.moqQty !== undefined ? { moqQty: row.moqQty } : {}),
      ...(row.moqUnit !== undefined ? { moqUnit: row.moqUnit } : {}),
      ...(row.moqUnitWeightKg !== undefined ? { moqUnitWeightKg: row.moqUnitWeightKg } : {}),
      ...(row.moqLegacyRaw ? { moqLegacyRaw: row.moqLegacyRaw } : {}),
    })),
  );
}

export function parseGradeRowsFromPayload(
  raw: unknown,
  category: CategoryGradeSource,
): { ok: true; rows: ProductGradeRow[] } | { ok: false; message: string } {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, message: "Dữ liệu bảng Grade & giá không hợp lệ." };
    }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, message: "Dữ liệu bảng Grade & giá không hợp lệ." };
  }
  if (parsed.length < MIN_GRADE_ROWS) {
    return { ok: false, message: "Cần ít nhất 1 dòng grade trong bảng Grade & giá." };
  }
  if (parsed.length > MAX_GRADE_ROWS) {
    return { ok: false, message: `Bảng Grade & giá tối đa ${MAX_GRADE_ROWS} dòng.` };
  }

  const drafts: ProductGradeRowDraft[] = parsed.map((entry, idx) => {
    const rec = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    if ("selectedGrade" in rec || "priceMin" in rec || "priceMax" in rec) {
      const hasStructuredMoq = "moqQty" in rec || "moqUnit" in rec || "moqUnitWeightKg" in rec || "moqLegacyRaw" in rec;
      return {
        id: `row-${idx + 1}`,
        selectedGrade: typeof rec.selectedGrade === "string" ? rec.selectedGrade : "",
        customGrade: typeof rec.customGrade === "string" ? rec.customGrade : "",
        priceMin: rec.priceMin == null ? "" : String(rec.priceMin),
        priceMax: rec.priceMax == null ? "" : String(rec.priceMax),
        incoterm: typeof rec.incoterm === "string" ? rec.incoterm : "FOB",
        moq: typeof rec.moq === "string" ? rec.moq : "",
        ...(hasStructuredMoq
          ? {
              moqQty: rec.moqQty == null ? "" : String(rec.moqQty),
              moqUnit: isMoqUnit(rec.moqUnit) ? rec.moqUnit : defaultMoqUnitForCategory(category),
              moqUnitWeightKg: rec.moqUnitWeightKg == null ? "" : String(rec.moqUnitWeightKg),
              moqLegacyRaw: typeof rec.moqLegacyRaw === "string" ? rec.moqLegacyRaw : "",
            }
          : {}),
      };
    }
    const isCustom = Boolean(rec.is_custom);
    const gradeText = typeof rec.grade === "string" ? rec.grade : "";
    const hasRowMoqQty = typeof rec.moq_qty === "number" && rec.moq_qty > 0 && isMoqUnit(rec.moq_unit);
    return {
      id: `row-${idx + 1}`,
      selectedGrade: isCustom ? CUSTOM_GRADE_OPTION : gradeText,
      customGrade: isCustom ? gradeText : "",
      priceMin: rec.price_min == null ? "" : String(rec.price_min),
      priceMax: rec.price_max == null ? "" : String(rec.price_max),
      incoterm: typeof rec.incoterm === "string" ? rec.incoterm : "FOB",
      moq: typeof rec.moq === "string" ? rec.moq : "",
      ...(hasRowMoqQty
        ? {
            moqQty: String(rec.moq_qty),
            moqUnit: rec.moq_unit as MoqUnit,
            moqUnitWeightKg: typeof rec.moq_unit_weight_kg === "number" && rec.moq_unit_weight_kg > 0 ? String(rec.moq_unit_weight_kg) : "",
            moqLegacyRaw: "",
          }
        : {}),
    };
  });

  const check = validateGradeRowsDraft(drafts, category);
  if (!check.valid) {
    return { ok: false, message: check.message ?? "Kiểm tra lại bảng Grade & giá." };
  }
  return { ok: true, rows: check.rows };
}

/**
 * Tổng hợp các cột phẳng trên supplier_products từ bảng grade_rows để toàn bộ
 * truy vấn cũ, thẻ sản phẩm và SQL view tiếp tục hoạt động đồng bộ.
 */
export function summarizeGradeRowsForProduct(
  rows: readonly ProductGradeRow[],
  category: CategoryGradeSource,
): {
  ref_price: number | null;
  ref_price_max: number | null;
  currency: string | null;
  unit: string | null;
  incoterm: string | null;
  moq: string | null;
  moq_qty: number | null;
  moq_unit: MoqUnit | null;
  moq_unit_weight_kg: number | null;
  moq_mt_equivalent: number | null;
  primaryStandardGrade: string | null;
  standardGrades: string[];
  gradeFieldKey: "grade" | "product_type";
} {
  const unitMeta = categoryMarketPriceUnit(category?.slug, category?.price_unit);
  const priced = rows.filter((row) => row.price_min !== null && row.price_max !== null);
  const refPrice = priced.length > 0 ? Math.min(...priced.map((row) => row.price_min!)) : null;
  const refPriceMax = priced.length > 0 ? Math.max(...priced.map((row) => row.price_max!)) : null;
  const firstIncoterm = rows.find((row) => row.incoterm)?.incoterm ?? null;
  const firstMoqRow = rows.find((row) => Boolean(row.moq) || (row.moq_qty && row.moq_unit)) ?? null;

  const standardGrades: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.is_custom || !row.grade) continue;
    const key = gradeKey(row.grade);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    standardGrades.push(row.grade);
  }

  return {
    ref_price: refPrice,
    ref_price_max: refPriceMax,
    currency: refPrice !== null ? "USD" : null,
    unit: refPrice !== null ? unitMeta.tradeUnit : null,
    incoterm: firstIncoterm,
    moq: firstMoqRow?.moq || null,
    moq_qty: firstMoqRow?.moq_qty ?? null,
    moq_unit: firstMoqRow?.moq_unit ?? null,
    moq_unit_weight_kg: firstMoqRow?.moq_unit_weight_kg ?? null,
    moq_mt_equivalent: firstMoqRow?.moq_mt_equivalent ?? null,
    primaryStandardGrade: standardGrades[0] ?? null,
    standardGrades,
    gradeFieldKey: primaryGradeFieldKey(category),
  };
}

export function applyGradeRowsToSpecs(
  baseSpecs: Record<string, unknown>,
  rows: readonly ProductGradeRow[],
  category: CategoryGradeSource,
): Record<string, unknown> {
  const summary = summarizeGradeRowsForProduct(rows, category);
  const next: Record<string, unknown> = { ...baseSpecs };
  delete next.grade;
  delete next.product_type;
  if (summary.primaryStandardGrade) {
    next[summary.gradeFieldKey] = summary.primaryStandardGrade;
  }
  if (summary.moq_unit_weight_kg !== null) {
    next.moq_unit_weight_kg = summary.moq_unit_weight_kg;
  } else {
    delete next.moq_unit_weight_kg;
  }
  next.grade_rows = rows.map((row) => ({
    grade: row.grade,
    is_custom: row.is_custom,
    price_min: row.price_min,
    price_max: row.price_max,
    incoterm: row.incoterm,
    moq: row.moq,
    moq_qty: row.moq_qty ?? null,
    moq_unit: row.moq_unit ?? null,
    moq_unit_weight_kg: row.moq_unit_weight_kg ?? null,
    moq_mt_equivalent: row.moq_mt_equivalent ?? null,
  }));
  return next;
}

export function formatGradeRowPriceBuyer(
  priceMin: number | null,
  priceMax: number | null,
  unit: PriceUnit,
): string | null {
  if (priceMin === null || priceMax === null || priceMin <= 0 || priceMax < priceMin) return null;
  if (priceMin === priceMax) return formatUnitPrice(priceMin, unit);
  return formatUnitRange(priceMin, priceMax, unit);
}

export function formatGradeRowPriceVi(
  priceMin: number | null,
  priceMax: number | null,
  unitLabel: "USD/kg" | "USD/MT",
): string {
  if (priceMin === null || priceMax === null || priceMin <= 0 || priceMax < priceMin) {
    return "Báo giá theo yêu cầu";
  }
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: unitLabel === "USD/kg" && !Number.isInteger(n) ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(n);
  if (priceMin === priceMax) return `${fmt(priceMin)} ${unitLabel}`;
  return `${fmt(priceMin)} - ${fmt(priceMax)} ${unitLabel}`;
}

/**
 * Chiếu dữ liệu grade_rows sang trang buyer công khai.
 * Tuyệt đối ẩn toàn bộ giá từng dòng khi cổng công khai giá (canShowPrice) đang khoá.
 */
export function projectPublicGradeData(
  product: Pick<SupplierProduct, "name" | "spec" | "specs" | "ref_price" | "ref_price_max" | "currency" | "unit" | "incoterm" | "moq" | "moq_qty" | "moq_unit" | "updated_at">,
  category: Category | Pick<Category, "slug" | "price_unit" | "product_fields">,
  options: {
    canShowPrice: boolean;
    sanitizeText: (value: string) => string;
    translateMoq: (moq: string | null | undefined) => string;
    fallbackMoq?: string | null;
    fallbackUpdatedAt?: string | null;
  },
): {
  hasGradeRows: boolean;
  primaryGrade: string | null;
  standardGrades: string[];
  cardGrades: string[];
  summaryPrice: string | null;
  moqUnit: MoqUnit | null;
  moqMtEquivalent: number | null;
  gradeRows: PublicProductGradeRow[];
  gradePricePoints: Array<{
    value: number;
    highValue: number;
    unit: string;
    currency: string;
    updatedAt: string | null;
    grade: string;
  }>;
} {
  const unitMeta = categoryMarketPriceUnit(category.slug, category.price_unit);
  const standardOptions = standardGradesForCategory(category);
  const stored = readStoredGradeRows(product.specs);
  const updatedAt = product.updated_at ?? options.fallbackUpdatedAt ?? null;

  if (stored.length > 0) {
    const standardGrades: string[] = [];
    const seenGrades = new Set<string>();
    const gradePricePoints: Array<{
      value: number;
      highValue: number;
      unit: string;
      currency: string;
      updatedAt: string | null;
      grade: string;
    }> = [];

    const gradeRows: PublicProductGradeRow[] = stored.map((row) => {
      const matchedStandard = !row.is_custom
        ? (standardOptions.length > 0 ? matchStandardGrade(row.grade, standardOptions) : row.grade)
        : null;
      const isCustom = row.is_custom || !matchedStandard;
      const displayGrade = options.sanitizeText(matchedStandard ?? row.grade).trim();

      if (!isCustom && displayGrade) {
        const key = gradeKey(displayGrade);
        if (key && !seenGrades.has(key)) {
          seenGrades.add(key);
          standardGrades.push(displayGrade);
        }
      }

      const allowRowPrice = options.canShowPrice && row.price_min !== null && row.price_max !== null && row.price_max >= row.price_min && row.price_min > 0;
      const priceText = allowRowPrice ? formatGradeRowPriceBuyer(row.price_min, row.price_max, unitMeta.primary) : null;

      if (allowRowPrice && !isCustom && displayGrade) {
        gradePricePoints.push({
          value: row.price_min!,
          highValue: row.price_max!,
          unit: unitMeta.tradeUnit,
          currency: "USD",
          updatedAt,
          grade: displayGrade,
        });
      }

      let resolvedMoq = "";
      let rowMoqUnit: MoqUnit | null = row.moq_unit ?? null;
      let rowMoqMt: number | null = row.moq_mt_equivalent ?? null;
      if (row.moq_qty && row.moq_unit) {
        resolvedMoq = formatStructuredMoqBuyer(row.moq_qty, row.moq_unit, row.moq_unit_weight_kg);
      } else {
        const rawMoq = row.moq || options.fallbackMoq || "";
        resolvedMoq = options.translateMoq(rawMoq);
        if (!rowMoqUnit && rawMoq) {
          const parsed = parseLegacyMoqString(rawMoq);
          if (parsed.status === "converted") {
            rowMoqUnit = parsed.unit;
            rowMoqMt = parsed.mtEquivalent;
          }
        }
      }
      const cleanMoq = options.sanitizeText(resolvedMoq).trim() || "On request";
      const cleanIncoterm = options.sanitizeText(row.incoterm || "").trim() || null;

      return {
        grade: displayGrade || "Standard",
        isCustom,
        priceMin: allowRowPrice ? row.price_min : null,
        priceMax: allowRowPrice ? row.price_max : null,
        priceText,
        incoterm: cleanIncoterm,
        moq: cleanMoq,
        moqUnit: rowMoqUnit,
        moqMtEquivalent: rowMoqMt,
      };
    });

    const optionOrder = new Map(standardOptions.map((opt, idx) => [gradeKey(opt), idx]));
    standardGrades.sort((a, b) => {
      const ia = optionOrder.get(gradeKey(a)) ?? Number.MAX_SAFE_INTEGER;
      const ib = optionOrder.get(gradeKey(b)) ?? Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });

    const pricedRows = gradeRows.filter((row) => row.priceMin !== null && row.priceMax !== null);
    const summaryPrice = pricedRows.length > 0
      ? formatGradeRowPriceBuyer(
          Math.min(...pricedRows.map((row) => row.priceMin!)),
          Math.max(...pricedRows.map((row) => row.priceMax!)),
          unitMeta.primary,
        )
      : null;

    const firstMoqRow = gradeRows.find((r) => r.moq !== "On request") ?? gradeRows[0] ?? null;

    return {
      hasGradeRows: true,
      primaryGrade: standardGrades[0] ?? null,
      standardGrades,
      cardGrades: standardGrades,
      summaryPrice,
      moqUnit: firstMoqRow?.moqUnit ?? null,
      moqMtEquivalent: firstMoqRow?.moqMtEquivalent ?? null,
      gradeRows,
      gradePricePoints,
    };
  }

  // Legacy single-grade fallback projection: normalize USD weight prices to the category's unified unit.
  const resolved = resolveGrade({
    name: product.name,
    spec: product.spec,
    categorySlug: category.slug,
    attributes: stringAttributesOnly(product.specs),
  });
  const legacyGrade = resolved.value ? options.sanitizeText(resolved.value).trim() : null;
  const standardGrades = legacyGrade ? [legacyGrade] : [];

  let legacySummaryPrice: string | null = null;
  if (options.canShowPrice && typeof product.ref_price === "number" && Number.isFinite(product.ref_price) && product.ref_price > 0) {
    const rawCurrency = (product.currency ?? "USD").trim().toUpperCase();
    const isUsd = rawCurrency === "USD" || rawCurrency.startsWith("USD/");
    const parsedSourceUnit = parsePriceUnit(product.unit, product.currency);
    const rawMax = typeof product.ref_price_max === "number" && Number.isFinite(product.ref_price_max) && product.ref_price_max >= product.ref_price
      ? product.ref_price_max
      : product.ref_price;
    if (isUsd && parsedSourceUnit) {
      const lowKg = toPricePerKg(product.ref_price, parsedSourceUnit);
      const highKg = toPricePerKg(rawMax, parsedSourceUnit);
      if (lowKg !== null && highKg !== null && lowKg >= MIN_REASONABLE_PRICE_PER_KG && highKg <= MAX_REASONABLE_PRICE_PER_KG) {
        const lowInCategoryUnit = fromPricePerKg(lowKg, unitMeta.primary);
        const highInCategoryUnit = fromPricePerKg(highKg, unitMeta.primary);
        legacySummaryPrice = formatGradeRowPriceBuyer(lowInCategoryUnit, highInCategoryUnit, unitMeta.primary);
      }
    }
  }

  const specWeight = product.specs && typeof product.specs === "object" && typeof (product.specs as Record<string, unknown>).moq_unit_weight_kg === "number"
    ? ((product.specs as Record<string, unknown>).moq_unit_weight_kg as number)
    : null;
  let legacyMoqUnit: MoqUnit | null = null;
  let legacyMoqMt: number | null = null;
  if (typeof product.moq_qty === "number" && product.moq_qty > 0 && isMoqUnit(product.moq_unit)) {
    legacyMoqUnit = product.moq_unit;
    legacyMoqMt = computeMoqMtEquivalent(product.moq_qty, product.moq_unit, specWeight);
  } else {
    const parsedMoq = parseLegacyMoqString(product.moq ?? options.fallbackMoq);
    if (parsedMoq.status === "converted") {
      legacyMoqUnit = parsedMoq.unit;
      legacyMoqMt = parsedMoq.mtEquivalent;
    }
  }

  return {
    hasGradeRows: false,
    primaryGrade: legacyGrade,
    standardGrades,
    cardGrades: [],
    summaryPrice: legacySummaryPrice,
    moqUnit: legacyMoqUnit,
    moqMtEquivalent: legacyMoqMt,
    gradeRows: [],
    gradePricePoints: [],
  };
}

export function exceedsMaxPriceSpread(priceMin: number, priceMax: number): boolean {
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax) || priceMin <= 0) return false;
  return priceMax > priceMin * MAX_PRICE_SPREAD_RATIO + 1e-9;
}

export interface ProductPricingComparable {
  name?: string | null;
  category?: string | null;
  supplier_category_proposal?: string | null;
  reviewed_category_slug?: string | null;
  spec?: string | null;
  specs?: Record<string, unknown> | null;
  ref_price?: number | null;
  ref_price_max?: number | null;
  currency?: string | null;
  unit?: string | null;
  moq?: string | null;
  moq_qty?: number | null;
  moq_unit?: string | null;
  incoterm?: string | null;
  price_publicly_visible?: boolean | null;
}

function canonicalScalarPriceSignature(item: ProductPricingComparable): string {
  const min = typeof item.ref_price === "number" && Number.isFinite(item.ref_price) && item.ref_price > 0
    ? Number(item.ref_price)
    : null;
  if (min === null) return "unpriced";
  const max = typeof item.ref_price_max === "number" && Number.isFinite(item.ref_price_max) && item.ref_price_max >= min
    ? Number(item.ref_price_max)
    : min;
  const currency = (item.currency ?? "USD").trim().toUpperCase();
  const parsedUnit = parsePriceUnit(item.unit, item.currency) ?? (item.unit ?? "").trim().toLowerCase();
  return `${currency}|${parsedUnit}|${min}:${max}`;
}

function canonicalGradeRowsPriceSignature(rows: ProductGradeRow[]): string {
  const priced = rows
    .filter((row) => typeof row.price_min === "number" && row.price_min > 0 && typeof row.price_max === "number" && row.price_max >= row.price_min)
    .map((row) => `${gradeKey(row.grade)}:${Number(row.price_min)}:${Number(row.price_max)}`);
  return priced.length > 0 ? priced.join("|") : "unpriced";
}

function canonicalHydratedDraftPriceSignature(
  item: ProductPricingComparable,
  category?: CategoryGradeSource | null,
): string {
  const drafts = hydrateGradeRowsDraft(
    {
      name: item.name ?? "",
      category: item.category ?? null,
      supplier_category_proposal: item.supplier_category_proposal ?? null,
      reviewed_category_slug: item.reviewed_category_slug ?? null,
      spec: item.spec ?? null,
      specs: item.specs ?? undefined,
      unit: item.unit ?? null,
      moq: item.moq ?? null,
      moq_qty: item.moq_qty ?? null,
      moq_unit: item.moq_unit ?? null,
      ref_price: item.ref_price ?? null,
      ref_price_max: item.ref_price_max ?? null,
      currency: item.currency ?? null,
      incoterm: item.incoterm ?? null,
    },
    category ?? {},
  );
  const priced: string[] = [];
  for (const row of drafts) {
    const grade = row.selectedGrade === CUSTOM_GRADE_OPTION
      ? cleanText(row.customGrade, 80)
      : cleanText(row.selectedGrade, 80);
    const min = Number(row.priceMin.trim());
    const max = Number(row.priceMax.trim());
    if (row.priceMin.trim() !== "" && row.priceMax.trim() !== "" && Number.isFinite(min) && min > 0 && Number.isFinite(max) && max >= min) {
      priced.push(`${gradeKey(grade)}:${min}:${max}`);
    }
  }
  return priced.length > 0 ? priced.join("|") : "unpriced";
}

export function hasProductPricingChanged(
  existing: ProductPricingComparable,
  next: ProductPricingComparable,
  category?: CategoryGradeSource | null,
): boolean {
  const existingRows = readStoredGradeRows(existing.specs);
  const nextRows = readStoredGradeRows(next.specs);

  let priceSignatureChanged = false;
  if (existingRows.length > 0 && nextRows.length > 0) {
    const prevUnit = (existing.unit ?? "").trim().toLowerCase();
    const nextUnit = (next.unit ?? "").trim().toLowerCase();
    const prevSig = canonicalGradeRowsPriceSignature(existingRows);
    const nextSig = canonicalGradeRowsPriceSignature(nextRows);
    priceSignatureChanged = prevSig !== nextSig || (nextSig !== "unpriced" && prevUnit !== nextUnit);
  } else if (existingRows.length === 0 && nextRows.length > 0) {
    const prevSig = canonicalHydratedDraftPriceSignature(existing, category);
    const nextSig = canonicalGradeRowsPriceSignature(nextRows);
    if (prevSig === "unpriced" && nextSig === "unpriced") {
      priceSignatureChanged = canonicalScalarPriceSignature(existing) !== canonicalScalarPriceSignature(next);
    } else {
      priceSignatureChanged = prevSig !== nextSig;
    }
  } else if (existingRows.length > 0 && nextRows.length === 0) {
    const prevSig = canonicalGradeRowsPriceSignature(existingRows);
    const nextSig = canonicalHydratedDraftPriceSignature(next, category);
    priceSignatureChanged = prevSig !== nextSig || canonicalScalarPriceSignature(existing) !== canonicalScalarPriceSignature(next);
  } else {
    priceSignatureChanged = canonicalScalarPriceSignature(existing) !== canonicalScalarPriceSignature(next);
  }

  if (priceSignatureChanged) return true;

  // Enabling public price visibility on an approved priced product where visibility was previously off also requires price check.
  const hadPublicFlag = Boolean(existing.price_publicly_visible);
  const nextPublicFlag = Boolean(next.price_publicly_visible);
  const nextHasPrice =
    (typeof next.ref_price === "number" && Number.isFinite(next.ref_price) && next.ref_price > 0) ||
    nextRows.some((row) => typeof row.price_min === "number" && row.price_min > 0);
  if (!hadPublicFlag && nextPublicFlag && nextHasPrice) {
    return true;
  }

  return false;
}

function formatReviewPriceNumber(value: number): string {
  const rounded = roundClean(value, 2);
  const [intPart, decPart] = String(rounded).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${grouped}.${decPart}` : grouped;
}

function summarizeComparablePrice(
  item: ProductPricingComparable,
  category?: CategoryGradeSource | null,
): string {
  const unitMeta = categoryMarketPriceUnit(category?.slug, category?.price_unit);
  const unitCode = unitMeta.primary === "mt" ? "MT" : "kg";
  const rows = readStoredGradeRows(item.specs);
  const pricedRows = rows.filter(
    (row) => typeof row.price_min === "number" && row.price_min > 0 && typeof row.price_max === "number" && row.price_max >= row.price_min,
  );
  if (pricedRows.length > 0) {
    const mins = pricedRows.map((row) => row.price_min as number);
    const maxs = pricedRows.map((row) => row.price_max as number);
    const low = Math.min(...mins);
    const high = Math.max(...maxs);
    const range = Math.abs(high - low) < 1e-9 ? formatReviewPriceNumber(low) : `${formatReviewPriceNumber(low)}-${formatReviewPriceNumber(high)}`;
    return `USD ${range}/${unitCode}`;
  }
  if (typeof item.ref_price === "number" && Number.isFinite(item.ref_price) && item.ref_price > 0) {
    const low = item.ref_price;
    const high = typeof item.ref_price_max === "number" && Number.isFinite(item.ref_price_max) && item.ref_price_max >= low
      ? item.ref_price_max
      : low;
    const currency = (item.currency ?? "USD").trim().toUpperCase();
    const unit = (item.unit ?? unitCode).trim();
    const range = Math.abs(high - low) < 1e-9 ? formatReviewPriceNumber(low) : `${formatReviewPriceNumber(low)}-${formatReviewPriceNumber(high)}`;
    return `${currency} ${range}/${unit}`;
  }
  return "Theo yêu cầu";
}

export function describePriceChangeForReview(
  existing: ProductPricingComparable,
  next: ProductPricingComparable,
  category?: CategoryGradeSource | null,
): string {
  const before = summarizeComparablePrice(existing, category);
  const after = summarizeComparablePrice(next, category);
  if (before === after && !existing.price_publicly_visible && next.price_publicly_visible) {
    return `NCC bật công khai giá tham khảo (${after}) - chờ kiểm tra lại giá.`;
  }
  return `NCC cập nhật giá tham khảo (${before} -> ${after}) - chờ kiểm tra lại giá.`;
}

