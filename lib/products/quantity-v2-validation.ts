import { validateSupplierQuantityEntry, type SupplierQuantityEntry, type SupplierQuantityEntryResult, type SupplierQuantityUnit } from "@/lib/products/quantity-entry";
import { readQuantityRevisionV2, toQuantityRevisionV2, v2InputTiers } from "@/lib/products/quantity-revision-v2";
import type { QuantityPricingPolicy } from "@/lib/products/quantity-pricing";

/** V2 is deliberately opt-in for isolated staging until all editors can read it. */
export function v2StagingEnabled(): boolean {
  return process.env.VEXIM_QUANTITY_V2_STAGING === "true";
}

export type CheckedV2Proposal = {
  value: { grade: string; incoterm: string; tiers: ReturnType<typeof toQuantityRevisionV2> } | null;
  errors: SupplierQuantityEntryResult["errors"];
  warnings: SupplierQuantityEntryResult["warnings"];
};
const invalid = (): CheckedV2Proposal => ({ value: null, errors: [{ code: "invalid", message: "Bảng giá không hợp lệ." }], warnings: [] });

/** The form's untrusted JSON is parsed here, never passed directly to the DB. */
export function validateV2Form(form: FormData, nameVi: string, grades: readonly string[], policy: QuantityPricingPolicy, prefix = ""): CheckedV2Proposal {
  const text = (name: string) => form.get(prefix + name);
  const grade = text("grade"), incoterm = text("incoterm");
  const unit = form.get("quantity_unit"), custom = form.get("quantity_custom_grade");
  const raw = form.get("quantity_tiers_json");
  if (typeof grade !== "string" || grade.length > 180 || typeof incoterm !== "string" || incoterm.length > 20 ||
      typeof unit !== "string" || !["kg", "mt"].includes(unit) || !["yes", "no"].includes(String(custom)) ||
      typeof raw !== "string" || raw.length > 12000) return invalid();
  let rows: unknown;
  try { rows = JSON.parse(raw); } catch { return invalid(); }
  if (!Array.isArray(rows) || rows.length > 4 || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row) ||
      typeof row.quantity !== "string" || typeof row.price !== "string" || row.quantity.length > 32 || row.price.length > 32)) return invalid();
  const input: SupplierQuantityEntry = { grade, incoterm, nameVi, unit: unit as SupplierQuantityUnit,
    customGrade: custom === "yes", tiers: rows };
  const checked = validateSupplierQuantityEntry(input, grades, policy);
  return { ...checked, value: checked.value ? { grade: checked.value.grade, incoterm: checked.value.incoterm, tiers: toQuantityRevisionV2(checked.value) } : null };
}

/** Revalidate stored JSON against current category, name, rules and grade bounds at approval. */
export function validateStoredV2(grade: unknown, incoterm: unknown, raw: unknown, nameVi: string, grades: readonly string[], policy: QuantityPricingPolicy): CheckedV2Proposal {
  const parsed = readQuantityRevisionV2(raw);
  if (!parsed || typeof grade !== "string" || typeof incoterm !== "string") return invalid();
  const tiers = v2InputTiers(parsed);
  const checked = validateSupplierQuantityEntry({ grade, incoterm, nameVi, customGrade: parsed.customGrade, unit: parsed.unit,
    tiers }, grades, policy);
  if (!checked.value) return { value: null, errors: checked.errors, warnings: checked.warnings };
  const normalized = toQuantityRevisionV2(checked.value);
  // Equality prevents a malicious or lossy record being approved under a different meaning.
  if (checked.value.grade !== grade || checked.value.incoterm !== incoterm || JSON.stringify(normalized) !== JSON.stringify(parsed.tiers)) return invalid();
  return { value: { grade, incoterm, tiers: normalized }, errors: checked.errors, warnings: checked.warnings };
}
