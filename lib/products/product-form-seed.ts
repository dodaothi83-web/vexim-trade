import { nonGradeProductFields } from "@/lib/products/grade-pricing";
import { parseProductFormDraft, type ProductFormDraft } from "@/lib/products/product-form-model";
import { readQuantityRevisionV2, v2InputTiers } from "@/lib/products/quantity-revision-v2";
import { normalizePriceInput } from "@/lib/products/quantity-pricing";
import type { ProductAttributeField, SupplierProduct } from "@/lib/types";

/** A blank form is intentionally incomplete. It is never a published product. */
export function emptyProductFormDraft(): ProductFormDraft {
  return {
    name: "", category: "", grade: "", customGrade: false,
    spec: "", rawMaterialRegion: "", inputMaterialOrigin: "", incoterm: "", incotermPlace: "",
    unit: "kg", tiers: [{ quantity: "", price: "" }], pricePubliclyVisible: false, priceConsent: false,
    paymentTerms: "", oem: false, odm: false, samples: false, packaging: "", exportPort: "",
    leadTimeDays: "", monthlyCapacityKg: "", description: "", descriptionDetail: "", attributes: {}, attributePool: "[]",
  };
}

type ApprovedPrice = { product_id: string; status: string; grade: unknown; incoterm: unknown; tiers: unknown };

type SeedResult =
  | { ok: true; draft: ProductFormDraft; unrepresentedMonthlyCapacity: string | null }
  | { ok: false; reason: "legacy_pricing" | "multiple_grades" | "invalid_price_revision" | "unrepresentable_fields" };

/**
 * Prepare an editor from an already-approved single-grade v2 revision. This only
 * creates an in-memory draft: authorization, private media, baseline locking and
 * approval are the caller's responsibility. The complete original product/specs
 * must be retained for any eventual merge; this is not a replacement record.
 *
 * In particular, do not infer quantity tiers from legacy price ranges, select a
 * grade from a multi-grade listing, round capacities, or silently truncate text.
 * Those listings must continue using their existing data until an explicit safe
 * handling path exists. Neither pending revisions nor another product's prices
 * may be used as an approved baseline.
 */
export function seedProductFormFromApproved(input: {
  product: SupplierProduct;
  categorySlug: string;
  fields: readonly Pick<ProductAttributeField, "key">[];
  priceRevision: ApprovedPrice | null;
}): SeedResult {
  const { product, priceRevision } = input;
  const specs = product.specs && typeof product.specs === "object" && !Array.isArray(product.specs) ? product.specs : {};
  const rows = specs.grade_rows;
  if (rows != null && (!Array.isArray(rows) || rows.length > 1)) return { ok: false, reason: "multiple_grades" };
  if (!priceRevision) return { ok: false, reason: "legacy_pricing" };
  if (priceRevision.status !== "approved" || priceRevision.product_id !== product.id ||
      typeof priceRevision.grade !== "string" || !priceRevision.grade.trim() ||
      typeof priceRevision.incoterm !== "string" || !priceRevision.incoterm.trim()) {
    return { ok: false, reason: "invalid_price_revision" };
  }
  const price = readQuantityRevisionV2(priceRevision.tiers);
  if (!price) return { ok: false, reason: "invalid_price_revision" };

  const attributes: Record<string, string> = {};
  for (const { key } of nonGradeProductFields(input.fields)) {
    if (typeof specs[key] === "string") attributes[key] = specs[key];
  }
  const draft = parseProductFormDraft({
    ...emptyProductFormDraft(),
    name: product.name ?? "", category: input.categorySlug,
    grade: priceRevision.grade, customGrade: price.customGrade, incoterm: priceRevision.incoterm,
    unit: price.unit, tiers: v2InputTiers(price).map((row) => ({ ...row, price: normalizePriceInput(row.price) })),
    spec: product.spec ?? "", rawMaterialRegion: product.raw_material_region ?? "", inputMaterialOrigin: product.input_material_origin ?? "",
    incotermPlace: product.incoterm_place ?? "", pricePubliclyVisible: product.price_publicly_visible === true,
    // A new revision requires a new explicit opt-in, not an inherited agreement.
    priceConsent: false, paymentTerms: product.payment_terms ?? "", oem: product.oem === true, odm: product.odm === true,
    samples: product.samples === true, packaging: product.packaging ?? "", exportPort: product.export_port ?? "",
    leadTimeDays: product.lead_time_days == null ? "" : String(product.lead_time_days),
    // An approved price revision does not prove the unit of legacy capacity.
    // A future loader may restore this from the exact linked approved form.
    monthlyCapacityKg: "", description: product.description ?? "",
    descriptionDetail: product.description_detail ?? "", attributes,
  });
  return draft ? { ok: true, draft, unrepresentedMonthlyCapacity: product.monthly_capacity?.trim() ? product.monthly_capacity : null }
    : { ok: false, reason: "unrepresentable_fields" };
}
