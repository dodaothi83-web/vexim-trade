import { seedLegacyCloneFromProduct } from "@/lib/products/product-form-legacy-clone-seed";
import { seedLegacyProductFormEdit } from "@/lib/products/product-form-legacy-edit-seed";
import { parseProductFormDraft, type ProductFormDraft } from "@/lib/products/product-form-model";
import type { ProductAttributeField, SupplierProduct } from "@/lib/types";

type Candidate = { grade: string | null; draft: ProductFormDraft; originalRow: unknown | null };
type Result = { ok: false; reason: "unrepresentable_fields" | "ambiguous_grade" | "too_many_grades" } | {
  ok: true; candidates: Candidate[]; unrepresentedSpecKeys: string[];
  unrepresentedMonthlyCapacity: string | null; requiresStaffCertificationReview: boolean;
};

/**
 * Read-only comparison, not a conversion or a basis for a write. Every legacy
 * grade row becomes a candidate; no old price, MOQ, capacity unit, image,
 * consent or public state is inferred or assigned to a new record.
 */
export function previewLegacyProductForms(input: {
  product: SupplierProduct; categorySlug: string; fields: readonly Pick<ProductAttributeField, "key">[]; standardGrades: readonly string[];
}): Result {
  const { product, standardGrades } = input;
  const specs = product.specs;
  if (specs != null && (typeof specs !== "object" || Array.isArray(specs))) return { ok: false, reason: "unrepresentable_fields" };
  const rows = specs?.grade_rows;
  if (rows != null && !Array.isArray(rows)) return { ok: false, reason: "ambiguous_grade" };
  if (!Array.isArray(rows) || rows.length <= 1) {
    const result = seedLegacyProductFormEdit(input);
    if (!result.ok) return { ok: false, reason: result.reason === "multiple_grades" ? "ambiguous_grade" : result.reason };
    const draft = parseProductFormDraft({ ...result.draft, pricePubliclyVisible: false, priceConsent: false });
    if (!draft) return { ok: false, reason: "unrepresentable_fields" };
    return { ok: true, candidates: [{ grade: draft.grade || null, draft, originalRow: rows?.[0] ?? null }],
      unrepresentedSpecKeys: result.unrepresentedSpecKeys, unrepresentedMonthlyCapacity: result.unrepresentedMonthlyCapacity,
      requiresStaffCertificationReview: result.requiresStaffCertificationReview };
  }
  if (rows.length > 30) return { ok: false, reason: "too_many_grades" };
  const cloned = seedLegacyCloneFromProduct(input);
  if (!cloned.ok) return cloned;
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { ok: false, reason: "ambiguous_grade" };
    const value = (row as Record<string, unknown>).grade;
    if (typeof value !== "string" || !value.trim() || value.length > 80) return { ok: false, reason: "ambiguous_grade" };
    const key = value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
    if (seen.has(key)) return { ok: false, reason: "ambiguous_grade" };
    seen.add(key);
    // Preserve the exact row label. A non-exact standard spelling is not silently changed.
    const draft = parseProductFormDraft({ ...cloned.draft, grade: value, customGrade: !standardGrades.includes(value),
      incoterm: "", incotermPlace: "", pricePubliclyVisible: false, priceConsent: false });
    if (!draft) return { ok: false, reason: "unrepresentable_fields" };
    candidates.push({ grade: value, draft, originalRow: row });
  }
  const keys = new Set(cloned.unrepresentedSpecKeys);
  keys.add("grade_rows");
  if (specs?.grade != null && specs.grade !== "") keys.add("grade");
  if (specs?.product_type != null && specs.product_type !== "") keys.add("product_type");
  return { ok: true, candidates, unrepresentedSpecKeys: [...keys].sort(),
    unrepresentedMonthlyCapacity: cloned.unrepresentedMonthlyCapacity,
    requiresStaffCertificationReview: cloned.requiresStaffCertificationCopy };
}
