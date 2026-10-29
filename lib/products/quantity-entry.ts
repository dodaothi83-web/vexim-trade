/**
 * Validation and exact unit conversion for the next quantity form.
 * This is not yet connected to persisted price revisions or the buyer catalog.
 * Keep the original unit prices and weights: USD/kg can be a repeating fraction.
 */
import { nameContainsGrade, type QuantityPricingIssue, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";

export type SupplierQuantityUnit = "kg" | "mt" | "bag" | "carton";
export type SupplierQuantityEntry = {
  grade: string;
  customGrade: boolean;
  incoterm: string;
  nameVi: string;
  unit: SupplierQuantityUnit;
  weightKg: string;
  tiers: Array<{ quantity: string; price: string }>;
};
export type NormalizedSupplierTier = {
  /** Thousandths of a kg. Keep as integer for comparisons and persistence. */
  quantityGrams: number;
  /** Price in USD cents per the original supplier unit. */
  priceCentsPerUnit: number;
  /** Number of grams in one supplier unit, shared by all tiers. */
  unitWeightGrams: number;
};
export type SupplierQuantityEntryResult = {
  errors: QuantityPricingIssue[];
  warnings: QuantityPricingIssue[];
  value: null | { grade: string; customGrade: boolean; incoterm: string; unit: SupplierQuantityUnit; unitWeightGrams: number; tiers: NormalizedSupplierTier[] };
};
const TERMS = new Set(["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"]);
const UNIT_NAMES = new Set<SupplierQuantityUnit>(["kg", "mt", "bag", "carton"]);
const MAX_GRAMS = 1_000_000_000_000;
const MAX_CENTS = 100_000_000_000;

/** Strict decimal to a scaled integer; reject excess digits instead of rounding. */
function scaledInteger(raw: string, digits: number, grouped: boolean, commaDecimal: boolean): bigint | null {
  let input = raw.trim();
  if (commaDecimal) {
    if (input.includes(",") && input.includes(".")) return null;
    input = input.replace(",", ".");
  } else if (grouped && input.includes(",")) {
    if (!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(input)) return null;
    input = input.replace(/,/g, "");
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match || (match[2]?.length ?? 0) > digits || match[1].length > 15) return null;
  const scale = 10n ** BigInt(digits);
  return BigInt(match[1]) * scale + BigInt((match[2] ?? "").padEnd(digits, "0") || "0");
}
function normalized(s: string): string { return s.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " "); }

/** Compare USD/unit against USD/kg bounds by cross multiplication, not a rounded division. */
function exceedsBound(cents: bigint, unitWeightGrams: bigint, bound: number, side: "min" | "max"): boolean {
  const boundScaled = scaledInteger(String(bound), 4, false, false);
  if (boundScaled === null) return true;
  // cents / 100 / (grams / 1000) versus boundScaled / 10000
  const left = cents * 100_000n;
  const right = boundScaled * unitWeightGrams;
  return side === "min" ? left < right : left > right;
}

export function validateSupplierQuantityEntry(input: SupplierQuantityEntry, standardGrades: readonly string[], policy: QuantityPricingPolicy): SupplierQuantityEntryResult {
  const errors: QuantityPricingIssue[] = [], warnings: QuantityPricingIssue[] = [];
  if (!Number.isInteger(policy.maxTiers) || policy.maxTiers < 1 || !Number.isFinite(policy.maxPriceRatio) || policy.maxPriceRatio < 1 ||
      !Number.isFinite(policy.maxLastMoqRatio) || policy.maxLastMoqRatio < 1) {
    return { errors: [{ code: "invalid_policy", message: "Cấu hình kiểm tra giá không hợp lệ." }], warnings, value: null };
  }
  const suppliedGrade = input.grade.trim().replace(/\s+/g, " ");
  const standardGrade = standardGrades.find((grade) => normalized(grade) === normalized(suppliedGrade));
  const grade = input.customGrade ? suppliedGrade : standardGrade ?? "";
  if (!grade || grade.length > 80 || (input.customGrade && standardGrade)) errors.push({ code: "grade", message: "Chọn grade hoặc nhập grade khác hợp lệ." });
  const foundGrade = [...standardGrades, grade].find((item) => nameContainsGrade(input.nameVi, [item]));
  if (foundGrade) errors.push({ code: "name_vi_grade", message: `Bỏ grade (${foundGrade}) ra khỏi tên sản phẩm.` });
  const term = input.incoterm.trim().toUpperCase();
  if (!TERMS.has(term)) errors.push({ code: "incoterm", message: "Chọn Incoterm hợp lệ." });
  if (!UNIT_NAMES.has(input.unit)) errors.push({ code: "unit", message: "Chọn đơn vị số lượng hợp lệ." });
  let unitWeight = input.unit === "kg" ? 1000n : input.unit === "mt" ? 1_000_000n : scaledInteger(input.weightKg, 3, false, true);
  if (unitWeight === null || unitWeight <= 0n || unitWeight > BigInt(MAX_GRAMS)) {
    errors.push({ code: "unit_weight", message: "Nhập trọng lượng kg cho mỗi bao hoặc thùng." });
    unitWeight = null;
  }
  const maxTiers = Math.min(4, policy.maxTiers);
  if (input.tiers.length < 1 || input.tiers.length > maxTiers) {
    errors.push({ code: "tier_count", message: `Nhập từ 1 đến ${maxTiers} mức giá.` });
    return { errors, warnings, value: null };
  }
  const tiers: NormalizedSupplierTier[] = [];
  for (let index = 0; index < input.tiers.length; index++) {
    const entry = input.tiers[index];
    // Quantities support up to 0.001 kg; in MT this requires six decimals.
    const qtyScale = input.unit === "mt" ? 6 : input.unit === "kg" ? 3 : 0;
    const qty = scaledInteger(entry.quantity, qtyScale, true, false);
    const price = scaledInteger(entry.price, 2, false, true);
    const divisor = 10n ** BigInt(qtyScale);
    const gramsProduct = qty !== null && unitWeight !== null ? qty * unitWeight : null;
    const grams = gramsProduct !== null && gramsProduct % divisor === 0n ? gramsProduct / divisor : null;
    if (qty === null || qty <= 0n || grams === null || grams <= 0n || grams > BigInt(MAX_GRAMS))
      errors.push({ code: "quantity", tierIndex: index, message: "Nhập số lượng hợp lệ với độ chính xác tối đa 0,001 kg." });
    if (price === null || price <= 0n || price > BigInt(MAX_CENTS))
      errors.push({ code: "price", tierIndex: index, message: "Nhập đơn giá lớn hơn 0, tối đa 2 chữ số thập phân." });
    if (grams !== null && grams > 0n && grams <= BigInt(MAX_GRAMS) && price !== null && price > 0n && price <= BigInt(MAX_CENTS) && unitWeight !== null)
      tiers.push({ quantityGrams: Number(grams), priceCentsPerUnit: Number(price), unitWeightGrams: Number(unitWeight) });
  }
  if (tiers.length === input.tiers.length) {
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].quantityGrams <= tiers[i - 1].quantityGrams) errors.push({ code: "quantity_order", tierIndex: i, message: "Số lượng mức sau phải lớn hơn mức trước." });
      if (tiers[i].priceCentsPerUnit > tiers[i - 1].priceCentsPerUnit) errors.push({ code: "price_order", tierIndex: i, message: "Đơn giá mức sau không được cao hơn mức trước." });
    }
    const prices = tiers.map((tier) => tier.priceCentsPerUnit);
    if (Math.max(...prices) / Math.min(...prices) > policy.maxPriceRatio + 1e-12) errors.push({ code: "price_spread", message: "Giá cao nhất vượt giới hạn so với giá thấp nhất." });
    if (tiers[tiers.length - 1].quantityGrams / tiers[0].quantityGrams > policy.maxLastMoqRatio + 1e-12) errors.push({ code: "quantity_spread", message: "Mức cuối vượt giới hạn so với MOQ." });
    const bounds = !input.customGrade ? Object.entries(policy.gradeBounds ?? {}).find(([key]) => normalized(key) === normalized(grade))?.[1] : undefined;
    if (bounds) {
      if (!Number.isFinite(bounds.minUsdPerKg) || !Number.isFinite(bounds.maxUsdPerKg) || bounds.minUsdPerKg <= 0 || bounds.maxUsdPerKg < bounds.minUsdPerKg ||
          scaledInteger(String(bounds.minUsdPerKg), 4, false, false) === null || scaledInteger(String(bounds.maxUsdPerKg), 4, false, false) === null) {
        errors.push({ code: "invalid_grade_bounds", message: "Ngưỡng giá của grade chưa được cấu hình hợp lệ." });
      } else {
        tiers.forEach((tier, tierIndex) => {
          if (exceedsBound(BigInt(tier.priceCentsPerUnit), BigInt(tier.unitWeightGrams), bounds.minUsdPerKg, "min") ||
              exceedsBound(BigInt(tier.priceCentsPerUnit), BigInt(tier.unitWeightGrams), bounds.maxUsdPerKg, "max"))
            warnings.push({ code: "grade_price_outlier", tierIndex, message: "Giá nằm ngoài ngưỡng tham khảo của grade và cần được rà soát." });
        });
      }
    }
  }
  return { errors, warnings, value: errors.length || unitWeight === null ? null : {
    grade, customGrade: input.customGrade, incoterm: term, unit: input.unit, unitWeightGrams: Number(unitWeight), tiers,
  } };
}
