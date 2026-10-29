import { seedLegacyCloneFromProduct } from "@/lib/products/product-form-legacy-clone-seed";
import { parseProductFormDraft, type ProductFormDraft } from "@/lib/products/product-form-model";
import type { ProductAttributeField, SupplierProduct } from "@/lib/types";

type Result = { ok: false; reason: "multiple_grades" | "ambiguous_grade" | "unrepresentable_fields" } | {
  ok: true; draft: ProductFormDraft;
  unrepresentedSpecKeys: string[]; requiresStaffCertificationReview: boolean; legacyPriceVisibilityUnknown: boolean;
  /** Original text is retained for staff review, never guessed as kg. */
  unrepresentedMonthlyCapacity: string | null;
};
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

/**
 * Prepare a private edit of an existing legacy listing without converting a
 * price range, package price, MOQ or capacity. The original row and URLs stay
 * untouched. Ambiguous/multiple legacy grades fail closed; callers must surface
 * unrepresented fields and retain them through approval, never silently drop.
 * This helper is not connected to supplier pages or publication.
 */
export function seedLegacyProductFormEdit(input: {
  product: SupplierProduct; categorySlug: string; fields: readonly Pick<ProductAttributeField, "key">[]; standardGrades: readonly string[];
}): Result {
  const { product, standardGrades } = input;
  const specs = product.specs;
  if (specs != null && (typeof specs !== "object" || Array.isArray(specs))) return { ok: false, reason: "unrepresentable_fields" };
  const rows = specs?.grade_rows;
  if (rows != null && !Array.isArray(rows)) return { ok: false, reason: "ambiguous_grade" };
  if (Array.isArray(rows) && rows.length > 1) return { ok: false, reason: "multiple_grades" };
  const baseGrade = specs?.grade;
  if (baseGrade != null && typeof baseGrade !== "string") return { ok: false, reason: "ambiguous_grade" };
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (row != null && (typeof row !== "object" || Array.isArray(row))) return { ok: false, reason: "ambiguous_grade" };
  const rowGrade: unknown = row && (row as Record<string, unknown>).grade;
  if (rowGrade != null && typeof rowGrade !== "string") return { ok: false, reason: "ambiguous_grade" };
  const gradeA = typeof baseGrade === "string" ? baseGrade.trim() : "", gradeB = typeof rowGrade === "string" ? rowGrade.trim() : "";
  if (gradeA && gradeB && normalize(gradeA) !== normalize(gradeB)) return { ok: false, reason: "ambiguous_grade" };
  const legacyGrade = gradeA || gradeB;
  const matchingGrades = legacyGrade ? standardGrades.filter((candidate) => normalize(candidate) === normalize(legacyGrade)) : [];
  if (matchingGrades.length > 1) return { ok: false, reason: "ambiguous_grade" };
  const standard = matchingGrades[0];
  // This legacy field has an unknown unit even when its text is numeric.
  const rawCapacity = product.monthly_capacity ?? "";
  const seeded = seedLegacyCloneFromProduct({ ...input, product: { ...product, monthly_capacity: null } });
  if (!seeded.ok) return seeded;
  const draft = parseProductFormDraft({ ...seeded.draft, grade: standard ?? legacyGrade, customGrade: !!legacyGrade && !standard,
    pricePubliclyVisible: product.price_publicly_visible === true, priceConsent: false, monthlyCapacityKg: "" });
  if (!draft) return { ok: false, reason: "unrepresentable_fields" };
  // grade_rows can contain legacy pricing and product_type may mean something
  // other than a grade. Both require review, not silent replacement.
  const unrepresented = new Set(seeded.unrepresentedSpecKeys);
  if (rows != null && (!Array.isArray(rows) || rows.length)) unrepresented.add("grade_rows");
  if (specs && specs.product_type != null && specs.product_type !== "") unrepresented.add("product_type");
  return { ok: true, draft, unrepresentedSpecKeys: [...unrepresented].sort(),
    requiresStaffCertificationReview: seeded.requiresStaffCertificationCopy,
    legacyPriceVisibilityUnknown: typeof product.price_publicly_visible !== "boolean",
    unrepresentedMonthlyCapacity: rawCapacity.trim() ? rawCapacity : null };
}
