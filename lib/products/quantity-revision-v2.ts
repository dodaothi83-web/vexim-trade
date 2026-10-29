import type { SupplierQuantityEntryResult, SupplierQuantityUnit } from "@/lib/products/quantity-entry";

/** Exact supplier input stored in the existing private revision JSON array. */
export type QuantityRevisionTierV2 = {
  version: 2;
  unit: SupplierQuantityUnit;
  customGrade: boolean;
  quantityGrams: number;
  unitWeightGrams: number;
  priceCentsPerUnit: number;
};
export type QuantityRevisionV2 = { unit: SupplierQuantityUnit; customGrade: boolean; unitWeightGrams: number; tiers: QuantityRevisionTierV2[] };
const UNITS = new Set<SupplierQuantityUnit>(["kg", "mt"]);

/** Only accept an already validated server-side entry. */
export function toQuantityRevisionV2(value: NonNullable<SupplierQuantityEntryResult["value"]>): QuantityRevisionTierV2[] {
  return value.tiers.map((tier) => ({ version: 2, unit: value.unit, customGrade: value.customGrade,
    quantityGrams: tier.quantityGrams, unitWeightGrams: tier.unitWeightGrams, priceCentsPerUnit: tier.priceCentsPerUnit }));
}

/**
 * Untrusted database JSON must be checked independently before it is shown.
 * A mixed or malformed version never falls back to old price data.
 */
export function readQuantityRevisionV2(input: unknown): QuantityRevisionV2 | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 4) return null;
  let unit: SupplierQuantityUnit | null = null;
  let weight = 0;
  let customGrade: boolean | null = null;
  const tiers: QuantityRevisionTierV2[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    if (row.version !== 2 || typeof row.unit !== "string" || !UNITS.has(row.unit as SupplierQuantityUnit) || typeof row.customGrade !== "boolean" ||
        typeof row.quantityGrams !== "number" || !Number.isSafeInteger(row.quantityGrams) || row.quantityGrams < 1 || row.quantityGrams > 1_000_000_000_000 ||
        typeof row.unitWeightGrams !== "number" || !Number.isSafeInteger(row.unitWeightGrams) || row.unitWeightGrams < 1 || row.unitWeightGrams > 1_000_000_000_000 ||
        typeof row.priceCentsPerUnit !== "number" || !Number.isSafeInteger(row.priceCentsPerUnit) || row.priceCentsPerUnit < 1 || row.priceCentsPerUnit > 100_000_000_000) return null;
    const rowUnit = row.unit as SupplierQuantityUnit;
    if ((rowUnit === "kg" && row.unitWeightGrams !== 1000) || (rowUnit === "mt" && row.unitWeightGrams !== 1_000_000)) return null;
    if (unit !== null && (unit !== rowUnit || weight !== row.unitWeightGrams || customGrade !== row.customGrade)) return null;
    const previous = tiers.at(-1);
    if (previous && (row.quantityGrams <= previous.quantityGrams || row.priceCentsPerUnit > previous.priceCentsPerUnit)) return null;
    unit = rowUnit; weight = row.unitWeightGrams; customGrade = row.customGrade;
    tiers.push({ version: 2, unit: rowUnit, customGrade: row.customGrade, quantityGrams: row.quantityGrams,
      unitWeightGrams: row.unitWeightGrams, priceCentsPerUnit: row.priceCentsPerUnit });
  }
  return unit === null || customGrade === null ? null : { unit, unitWeightGrams: weight, customGrade, tiers };
}

/** Price comparisons and filters use kg; buyer-facing prices retain original cents. */
export function v2PriceUsdPerKg(row: QuantityRevisionTierV2): number {
  return row.priceCentsPerUnit * 10 / row.unitWeightGrams;
}
export function v2QuantityInSupplierUnit(grams: number, weight: number): number { return grams / weight; }

/** Reconstruct the exact input without first rounding through USD/kg. */
export function v2InputDecimal(value: number, scale: number): string {
  const whole = Math.floor(value / scale);
  const remainder = value % scale;
  return remainder ? `${whole}.${String(remainder).padStart(String(scale).length - 1, "0").replace(/0+$/, "")}` : String(whole);
}
export function v2InputTiers(revision: QuantityRevisionV2): Array<{ quantity: string; price: string }> {
  return revision.tiers.map((tier) => ({
    quantity: v2InputDecimal(tier.quantityGrams, revision.unitWeightGrams),
    price: v2InputDecimal(tier.priceCentsPerUnit, 100),
  }));
}
export function v2UnitLabel(unit: SupplierQuantityUnit): string {
  return unit === "mt" ? "MT" : "kg";
}
export function v2FormatAmount(value: number, maximumFractionDigits = 6): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}
export function v2QuantityLabel(grams: number, revision: QuantityRevisionV2): string {
  const amount = v2QuantityInSupplierUnit(grams, revision.unitWeightGrams);
  return `${v2FormatAmount(amount)} ${v2UnitLabel(revision.unit)}`;
}
export function v2PriceLabel(cents: number, unit: SupplierQuantityUnit): string {
  return `USD ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)}/${v2UnitLabel(unit)}`;
}
