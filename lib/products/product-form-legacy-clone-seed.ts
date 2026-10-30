import { nonGradeProductFields } from "@/lib/products/grade-pricing";
import { emptyProductFormDraft } from "@/lib/products/product-form-seed";
import { parseProductFormDraft, type ProductFormDraft } from "@/lib/products/product-form-model";
import type { ProductAttributeField, SupplierProduct } from "@/lib/types";

type Result = { ok: false; reason: "unrepresentable_fields" } | {
  ok: true; draft: ProductFormDraft;
  /** Do not discard these; the future clone flow must review/preserve them separately. */
  unrepresentedSpecKeys: string[];
  requiresStaffCertificationCopy: boolean;
  /** Retain separately for staff review; legacy text does not prove kg/month. */
  unrepresentedMonthlyCapacity: string | null;
};

/**
 * Produce only an unsaved draft from common legacy fields, including a source
 * with multiple grades. Never choose a legacy grade, price, MOQ or packaging
 * conversion. Images, hidden specs and staff-only certification data require a
 * separate authorized copy/review workflow; this helper never creates records or
 * touches the source. Oversized/unrepresentable fields cause an explicit failure.
 */
export function seedLegacyCloneFromProduct(input: {
  product: SupplierProduct; categorySlug: string; fields: readonly Pick<ProductAttributeField, "key">[];
}): Result {
  const { product } = input;
  if (product.specs != null && (typeof product.specs !== "object" || Array.isArray(product.specs)))
    return { ok: false, reason: "unrepresentable_fields" };
  const specs = product.specs ?? {};
  const fields = nonGradeProductFields(input.fields);
  const declared = new Set(fields.map((field) => field.key));
  const attributes: Record<string, string> = {};
  for (const { key } of fields) {
    if (specs[key] == null) continue;
    if (typeof specs[key] !== "string") return { ok: false, reason: "unrepresentable_fields" };
    attributes[key] = specs[key] as string;
  }
  // Grade rows are intentionally left behind, not converted into a price tier.
  // Unknown metadata is surfaced, not silently copied or deleted.
  const excluded = new Set(["grade", "product_type", "grade_rows"]);
  const unrepresentedSpecKeys = Object.keys(specs).filter((key) => !declared.has(key) && !excluded.has(key)).sort();
  const draft = parseProductFormDraft({
    ...emptyProductFormDraft(), name: product.name ?? "", category: input.categorySlug,
    spec: product.spec ?? "", rawMaterialRegion: product.raw_material_region ?? "", inputMaterialOrigin: product.input_material_origin ?? "",
    incoterm: product.incoterm ?? "", incotermPlace: product.incoterm_place ?? "", paymentTerms: product.payment_terms ?? "",
    oem: product.oem === true, odm: product.odm === true, samples: product.samples === true,
    packaging: product.packaging ?? "", exportPort: product.export_port ?? "",
    // Legacy capacity may be a bare number or package count; neither proves kg.
    leadTimeDays: product.lead_time_days == null ? "" : String(product.lead_time_days), monthlyCapacityKg: "",
    description: product.description ?? "", descriptionDetail: product.description_detail ?? "", attributes,
  });
  if (!draft) return { ok: false, reason: "unrepresentable_fields" };
  return { ok: true, draft, unrepresentedSpecKeys,
    unrepresentedMonthlyCapacity: product.monthly_capacity?.trim() ? product.monthly_capacity : null,
    requiresStaffCertificationCopy: !!product.certifications?.trim() || !!product.certifications_i18n && Object.values(product.certifications_i18n).some(Boolean) };
}
