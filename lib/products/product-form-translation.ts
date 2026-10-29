import "server-only";

import { translateProductContent, translationConfigured, type ProductTranslation, type ProductTranslationSource } from "@/lib/ai/translate-content";
import { sanitizeProductDescriptionForSave } from "@/lib/products/product-description";
import { parseProductFormDraft } from "@/lib/products/product-form-model";
import { nameContainsGrade } from "@/lib/products/quantity-pricing";

type TranslationSuggestion =
  | { ok: false; reason: "invalid_draft" | "unconfigured" | "failed" }
  | { ok: true; translation: ProductTranslation; model: string; nameNeedsEdit: boolean };

/**
 * Suggest a translation from the private submission, without modifying the
 * product or its approved English revision. The caller must authorize staff and
 * bind any displayed/saved suggestion to the exact pending submission; this is
 * not an approval and the final English title must be validated again at review.
 * The form does not include staff-only certifications: never apply this result
 * wholesale to an existing product or overwrite its certification translation.
 */
export async function suggestProductFormTranslation(rawDraft: unknown, standardGrades: readonly string[]): Promise<TranslationSuggestion> {
  const draft = parseProductFormDraft(rawDraft);
  if (!draft || !draft.name.trim()) return { ok: false, reason: "invalid_draft" };
  try {
    if (sanitizeProductDescriptionForSave(draft.descriptionDetail) !== draft.descriptionDetail)
      return { ok: false, reason: "invalid_draft" };
  } catch { return { ok: false, reason: "invalid_draft" }; }
  if (!translationConfigured()) return { ok: false, reason: "unconfigured" };
  // Prices are not required for translation and must not be sent to the model.
  const source: ProductTranslationSource = {
    name: draft.name, description: draft.description, spec: draft.spec, description_detail: draft.descriptionDetail,
    packaging: draft.packaging, payment_terms: draft.paymentTerms, raw_material_region: draft.rawMaterialRegion,
    input_material_origin: draft.inputMaterialOrigin, incoterm_place: draft.incotermPlace, export_port: draft.exportPort,
    monthly_capacity: draft.monthlyCapacityKg.trim() ? `${draft.monthlyCapacityKg.trim()} kg` : "",
    moq: draft.tiers[0]?.quantity.trim() ? `${draft.tiers[0].quantity.trim()} ${draft.unit === "mt" ? "tấn" : "kg"}` : "",
  };
  try {
    const { translation, model } = await translateProductContent(source);
    if (!translation.name.trim() || translation.name.trim().length > 180 ||
        sanitizeProductDescriptionForSave(translation.description_detail) !== translation.description_detail)
      return { ok: false, reason: "failed" };
    return { ok: true, translation, model, nameNeedsEdit: nameContainsGrade(translation.name, [...standardGrades, draft.grade]) };
  } catch (error) {
    console.error("[product-form] translation suggestion failed", error);
    return { ok: false, reason: "failed" };
  }
}
