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

export const SUPPLIER_PRICE_INCOTERMS = [
  "FOB",
  "CIF",
  "CFR",
  "EXW",
  "FCA",
  "DAP",
  "DDP",
] as const;

export const MAX_SUPPLIER_PRICE_TIERS = 5;

export interface SupplierPriceTierDraft {
  minQty: string;
  unitPrice: string;
}

export interface SupplierPriceTier {
  min_qty: number;
  /** Auto-computed upper bound from the next tier's `min_qty` (e.g. 100 when next starts at 101), or `null` for the final tier ("trở lên"). */
  max_qty: number | null;
  unit_price: number;
}

export interface SupplierPriceTierPreviewRow {
  index: number;
  minQtyNum: number | null;
  maxQtyNum: number | null;
  /** Display label for the auto-computed "Đến" cell (`"100"`, `"trở lên"`, or `"—"`). */
  maxQtyLabel: string;
  isOpenEnded: boolean;
  unitPriceNum: number | null;
}

export type SupplierPriceTierValidationResult =
  | {
      ok: true;
      tiers: SupplierPriceTier[];
      refPrice: number | null;
      refPriceMax: number | null;
      currency: string | null;
      unit: string | null;
      incoterm: string | null;
    }
  | {
      ok: false;
      message: string;
    };

export const isSupplierPriceUnit = (value: string) => SUPPLIER_PRICE_UNITS.some((option) => option.value === value);
export const isSupplierPriceCurrency = (value: string) => SUPPLIER_PRICE_CURRENCIES.some((option) => option.value === value);
export const isSupplierPriceIncoterm = (value: string) =>
  (SUPPLIER_PRICE_INCOTERMS as readonly string[]).includes(value);

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

/** Match standard Incoterm codes case-insensitively; preserve trimmed legacy values up to 20 chars. */
export function normalizeSupplierPriceIncoterm(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const upper = trimmed.toUpperCase();
  const match = SUPPLIER_PRICE_INCOTERMS.find((code) => code === upper);
  return match ?? upper.slice(0, 20);
}

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  const text = String(value);
  const dot = text.indexOf(".");
  return dot >= 0 ? Math.min(text.length - dot - 1, 3) : 0;
}

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Parse positive numeric input accepting either `.` or Vietnamese `,` as decimal separator
 * (e.g. `"10"`, `"101"`, `"1.5"`, `"1,5"`, `"50000"`).
 */
export function parseSupplierTierNumber(
  raw: string | number | null | undefined,
  maxDecimals = 2,
  maxValue = 999_999_999_999.99,
): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0 || raw > maxValue) return null;
    return roundToDecimals(raw, maxDecimals);
  }
  const compact = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!compact) return null;
  const pattern = new RegExp(`^\\d+([.,]\\d{1,${maxDecimals}})?$`);
  if (!pattern.test(compact)) return null;
  const parsed = Number(compact.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > maxValue) return null;
  return roundToDecimals(parsed, maxDecimals);
}

/**
 * Auto-compute the upper quantity bound (`Đến`) for a tier from the next tier's start quantity:
 * - Integer example: tier 1 `min = 10`, tier 2 `min = 101` -> `101 - 1 = 100`.
 * - Decimal example: tier 1 `min = 0.5`, tier 2 `min = 2` -> `2 - 0.1 = 1.9`.
 * - Final tier (`nextMin === null`): returns `null` (open-ended / `"trở lên"`).
 */
export function computeSupplierTierMaxQty(
  currentMin: number,
  nextMin: number | null,
): number | null {
  if (nextMin === null) return null;
  if (!Number.isFinite(currentMin) || !Number.isFinite(nextMin) || nextMin <= currentMin) {
    return null;
  }
  const decimals = Math.max(decimalPlaces(currentMin), decimalPlaces(nextMin));
  const step = 10 ** -decimals;
  const computed = roundToDecimals(nextMin - step, decimals);
  return computed >= currentMin ? computed : null;
}

export function formatSupplierTierNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  const [intPart, decPart] = String(roundToDecimals(value, 2)).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart ? `${grouped}.${decPart}` : grouped;
}

/** Build live auto-computed upper bounds (`Đến`) for each draft row in the editor. */
export function previewSupplierPriceTierRows(
  drafts: readonly SupplierPriceTierDraft[],
): SupplierPriceTierPreviewRow[] {
  const parsedMins = drafts.map((row) => parseSupplierTierNumber(row.minQty, 2, 1_000_000_000));
  const parsedPrices = drafts.map((row) => parseSupplierTierNumber(row.unitPrice, 2));

  let lastFilledIndex = -1;
  for (let i = drafts.length - 1; i >= 0; i--) {
    if (drafts[i].minQty.trim() !== "" || drafts[i].unitPrice.trim() !== "") {
      lastFilledIndex = i;
      break;
    }
  }

  return drafts.map((row, index) => {
    const minQtyNum = parsedMins[index];
    const unitPriceNum = parsedPrices[index];
    const isEmpty = row.minQty.trim() === "" && row.unitPrice.trim() === "";

    if (lastFilledIndex === -1) {
      return {
        index,
        minQtyNum: null,
        maxQtyNum: null,
        maxQtyLabel: index === drafts.length - 1 ? "trở lên" : "—",
        isOpenEnded: index === drafts.length - 1,
        unitPriceNum: null,
      };
    }

    if (index > lastFilledIndex && isEmpty) {
      return {
        index,
        minQtyNum: null,
        maxQtyNum: null,
        maxQtyLabel: "—",
        isOpenEnded: false,
        unitPriceNum: null,
      };
    }

    if (index === lastFilledIndex) {
      return {
        index,
        minQtyNum,
        maxQtyNum: null,
        maxQtyLabel: "trở lên",
        isOpenEnded: true,
        unitPriceNum,
      };
    }

    const nextMin = parsedMins[index + 1];
    if (minQtyNum !== null && nextMin !== null && nextMin > minQtyNum) {
      const maxQtyNum = computeSupplierTierMaxQty(minQtyNum, nextMin);
      return {
        index,
        minQtyNum,
        maxQtyNum,
        maxQtyLabel: maxQtyNum !== null ? formatSupplierTierNumber(maxQtyNum) : "—",
        isOpenEnded: false,
        unitPriceNum,
      };
    }

    return {
      index,
      minQtyNum,
      maxQtyNum: null,
      maxQtyLabel: "—",
      isOpenEnded: false,
      unitPriceNum,
    };
  });
}

/** Parse and normalize stored `specs.price_tiers` safely. */
export function readStoredSupplierPriceTiers(
  specs: Record<string, unknown> | null | undefined,
): SupplierPriceTier[] {
  if (!specs || typeof specs !== "object") return [];
  const raw = specs.price_tiers;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SUPPLIER_PRICE_TIERS) return [];

  const parsed: Array<{ min_qty: number; unit_price: number }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return [];
    const rec = item as Record<string, unknown>;
    const minQty = parseSupplierTierNumber(rec.min_qty as number | string | null | undefined, 2, 1_000_000_000);
    const unitPrice = parseSupplierTierNumber(rec.unit_price as number | string | null | undefined, 2);
    if (minQty === null || unitPrice === null) return [];
    if (parsed.length > 0 && minQty <= parsed[parsed.length - 1].min_qty) return [];
    parsed.push({ min_qty: minQty, unit_price: unitPrice });
  }

  return parsed.map((row, index) => ({
    min_qty: row.min_qty,
    max_qty: index < parsed.length - 1
      ? computeSupplierTierMaxQty(row.min_qty, parsed[index + 1].min_qty)
      : null,
    unit_price: row.unit_price,
  }));
}

export function hydrateSupplierPriceTierDrafts(
  specs: Record<string, unknown> | null | undefined,
): SupplierPriceTierDraft[] {
  const stored = readStoredSupplierPriceTiers(specs);
  if (stored.length > 0) {
    return stored.map((tier) => ({
      minQty: String(tier.min_qty),
      unitPrice: String(tier.unit_price),
    }));
  }
  return [{ minQty: "", unitPrice: "" }];
}

export function validateSupplierPriceTiers(
  drafts: readonly SupplierPriceTierDraft[],
  meta: {
    currency?: string | null;
    unit?: string | null;
    incoterm?: string | null;
  },
): SupplierPriceTierValidationResult {
  if (!Array.isArray(drafts) || drafts.length > MAX_SUPPLIER_PRICE_TIERS) {
    return { ok: false, message: `Tối đa ${MAX_SUPPLIER_PRICE_TIERS} bậc giá cho mỗi sản phẩm.` };
  }

  const currency = normalizeSupplierPriceCurrency(meta.currency);
  const unit = normalizeSupplierPriceUnit(meta.unit);
  const incoterm = normalizeSupplierPriceIncoterm(meta.incoterm);

  let lastFilledIndex = -1;
  for (let i = drafts.length - 1; i >= 0; i--) {
    if (drafts[i].minQty.trim() !== "" || drafts[i].unitPrice.trim() !== "") {
      lastFilledIndex = i;
      break;
    }
  }

  if (lastFilledIndex === -1) {
    return {
      ok: true,
      tiers: [],
      refPrice: null,
      refPriceMax: null,
      currency: currency || null,
      unit: unit || null,
      incoterm: incoterm || null,
    };
  }

  const activeDrafts = drafts.slice(0, lastFilledIndex + 1);
  const parsedRows: Array<{ min_qty: number; unit_price: number }> = [];

  for (let i = 0; i < activeDrafts.length; i++) {
    const minRaw = activeDrafts[i].minQty.trim();
    const priceRaw = activeDrafts[i].unitPrice.trim();
    if (!minRaw && !priceRaw) {
      return { ok: false, message: `Xóa hoặc điền đầy đủ bậc giá trống ở bậc ${i + 1}.` };
    }
    if (!minRaw || !priceRaw) {
      return { ok: false, message: `Nhập đủ Số lượng từ và Đơn giá cho bậc ${i + 1} (hoặc xóa dòng trống).` };
    }
    const minQty = parseSupplierTierNumber(minRaw, 2, 1_000_000_000);
    if (minQty === null) {
      return { ok: false, message: `Số lượng từ ở bậc ${i + 1} phải là số lớn hơn 0 (tối đa 2 chữ số thập phân).` };
    }
    const unitPrice = parseSupplierTierNumber(priceRaw, 2);
    if (unitPrice === null) {
      return { ok: false, message: `Đơn giá ở bậc ${i + 1} phải là số lớn hơn 0 (tối đa 2 chữ số thập phân).` };
    }
    if (i > 0 && minQty <= parsedRows[i - 1].min_qty) {
      return {
        ok: false,
        message: `Số lượng từ ở bậc ${i + 1} phải lớn hơn bậc ${i} (lớn hơn ${formatSupplierTierNumber(parsedRows[i - 1].min_qty)}).`,
      };
    }
    if (i > 0 && unitPrice > parsedRows[i - 1].unit_price) {
      return {
        ok: false,
        message: `Đơn giá ở bậc ${i + 1} (số lượng lớn hơn) cần nhỏ hơn hoặc bằng bậc ${i}.`,
      };
    }
    parsedRows.push({ min_qty: minQty, unit_price: unitPrice });
  }

  if (!currency || !isSupplierPriceCurrency(currency)) {
    return { ok: false, message: "Chọn Tiền tệ (USD, VND hoặc EUR) cho bảng bậc giá." };
  }
  if (!unit || !isSupplierPriceUnit(unit)) {
    return { ok: false, message: "Chọn Đơn vị tính cho bảng bậc giá." };
  }

  const tiers: SupplierPriceTier[] = parsedRows.map((row, index) => ({
    min_qty: row.min_qty,
    max_qty: index < parsedRows.length - 1
      ? computeSupplierTierMaxQty(row.min_qty, parsedRows[index + 1].min_qty)
      : null,
    unit_price: row.unit_price,
  }));

  const prices = tiers.map((tier) => tier.unit_price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  return {
    ok: true,
    tiers,
    refPrice: low,
    refPriceMax: high > low ? high : null,
    currency,
    unit,
    incoterm: incoterm || null,
  };
}

export function parseSupplierPriceTiersFormJson(raw: unknown): SupplierPriceTierDraft[] | null {
  if (typeof raw !== "string") return null;
  if (raw.length > 8000) return null;
  if (!raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > MAX_SUPPLIER_PRICE_TIERS) return null;
    const drafts: SupplierPriceTierDraft[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const minQty = typeof rec.minQty === "string" ? rec.minQty.slice(0, 32) : "";
      const unitPrice = typeof rec.unitPrice === "string" ? rec.unitPrice.slice(0, 32) : "";
      drafts.push({ minQty, unitPrice });
    }
    return drafts;
  } catch {
    return null;
  }
}

export function formatSupplierPriceTierRangeVi(
  tier: SupplierPriceTier,
  unit?: string | null,
): string {
  const unitSuffix = unit?.trim() ? ` ${unit.trim()}` : "";
  const minText = formatSupplierTierNumber(tier.min_qty);
  if (tier.max_qty === null) {
    return `Từ ${minText}${unitSuffix} trở lên`;
  }
  if (tier.max_qty === tier.min_qty) {
    return `${minText}${unitSuffix}`;
  }
  return `${minText} – ${formatSupplierTierNumber(tier.max_qty)}${unitSuffix}`;
}

export function formatSupplierPriceTierRangeEn(
  tier: SupplierPriceTier,
  unit?: string | null,
): string {
  const unitSuffix = unit?.trim() ? ` ${unit.trim()}` : "";
  const minText = formatSupplierTierNumber(tier.min_qty);
  if (tier.max_qty === null) {
    return `${minText}+${unitSuffix}`;
  }
  if (tier.max_qty === tier.min_qty) {
    return `${minText}${unitSuffix}`;
  }
  return `${minText}–${formatSupplierTierNumber(tier.max_qty)}${unitSuffix}`;
}

export function formatSupplierPriceTierUnitPriceVi(
  unitPrice: number,
  currency?: string | null,
  unit?: string | null,
): string {
  const cur = normalizeSupplierPriceCurrency(currency) || (currency?.trim().toUpperCase() || "USD");
  const u = unit?.trim() || "";
  return `${formatSupplierTierNumber(unitPrice)} ${cur}${u ? `/${u}` : ""}`;
}

export function formatSupplierPriceTierSummaryVi(
  tiers: readonly SupplierPriceTier[],
  currency?: string | null,
  unit?: string | null,
  incoterm?: string | null,
): string {
  if (!tiers.length) return "Báo giá theo yêu cầu";
  const cur = normalizeSupplierPriceCurrency(currency) || (currency?.trim().toUpperCase() || "USD");
  const u = unit?.trim() || "";
  const prices = tiers.map((tier) => tier.unit_price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const range = high > low
    ? `${formatSupplierTierNumber(low)}–${formatSupplierTierNumber(high)}`
    : formatSupplierTierNumber(low);
  const base = `${range} ${cur}${u ? `/${u}` : ""}`;
  const inc = incoterm?.trim();
  return inc ? `${base} (${inc})` : base;
}
