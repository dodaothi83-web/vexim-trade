import { parseProductFormDraft, type ProductFormDraft } from "@/lib/products/product-form-model";
import { isGradeFieldKey } from "@/lib/products/grade-pricing";

/**
 * Prepare unsaved, private form data for a different grade. This is not a DB
 * operation and cannot create, publish, delete or modify a product. Callers
 * must separately authorize cloning, copy permitted files to new ownership, and
 * preserve staff-only and historical fields through the eventual review flow.
 *
 * Never carry a grade, quantity, price or consent into a different-grade offer:
 * those values belong to the original. In particular an old min/max range is
 * not a quantity tier and must be shown for manual review, not inferred here.
 */
export function cloneProductFormForDifferentGrade(input: unknown): ProductFormDraft | null {
  const source = parseProductFormDraft(input);
  if (!source) return null;
  return parseProductFormDraft({
    ...source,
    grade: "", customGrade: false,
    tiers: [{ quantity: "", price: "" }],
    pricePubliclyVisible: false, priceConsent: false,
    // Older or tampered drafts may contain grade-like attribute keys even
    // though the shared editor hides them. Do not copy those into the clone.
    attributes: Object.fromEntries(Object.entries(source.attributes).filter(([key]) => !isGradeFieldKey(key))),
  });
}
