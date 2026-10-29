import { nameContainsGrade } from "@/lib/products/quantity-pricing";
import { validateSupplierQuantityEntry } from "@/lib/products/quantity-entry";
import { readQuantityRevisionV2, toQuantityRevisionV2, v2InputDecimal, v2QuantityLabel } from "@/lib/products/quantity-revision-v2";
import { sanitizeProductDescriptionForSave } from "@/lib/products/product-description";
import type { ProductFormReviewValidation } from "@/lib/products/product-form-review-validation";
import type { SupplierProduct } from "@/lib/types";

const reserved = new Set(["__proto__", "constructor", "prototype", "tostring", "grade", "product_type", "grade_rows", "lead_time", "moq_unit_weight_kg"]);
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
const canonical = (value: unknown): string | undefined => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: string) => value.trim() || null;

type Result = { ok: true; patch: Partial<SupplierProduct>; moqRequiresTextFallback: boolean } |
  { ok: false; reason: "invalid_snapshot" | "legacy_grade_unmapped" | "legacy_capacity_unmapped" };

/**
 * Draft a lossless product patch after the review validator has approved the
 * exact private snapshot. No writes occur here. The eventual approval RPC must
 * lock and compare the whole review context, archive the pre-change product,
 * bind the price/name and approved image manifest, and apply this patch in one
 * transaction. Never expose this plan to a browser or trust a browser patch.
 */
export function planProductFormPublication(input: {
  product: Pick<SupplierProduct, "specs" | "name_i18n" | "monthly_capacity">;
  validated: Extract<ProductFormReviewValidation, { ok: true }>;
  quantity: unknown;
}): Result {
  const { product, validated, quantity } = input;
  const draft = validated.draft;
  if (!object(quantity) || typeof quantity.grade !== "string" || typeof quantity.incoterm !== "string" ||
      !object(product.specs ?? {}) || !object(product.name_i18n ?? {})) return { ok: false, reason: "invalid_snapshot" };
  const price = readQuantityRevisionV2(quantity.tiers);
  if (!price || typeof validated.englishName !== "string" || !validated.englishName.trim() || validated.englishName !== validated.englishName.trim() ||
      validated.englishName.length > 180 || nameContainsGrade(validated.englishName, [quantity.grade]) ||
      (draft.pricePubliclyVisible && !draft.priceConsent))
    return { ok: false, reason: "invalid_snapshot" };
  try {
    if (sanitizeProductDescriptionForSave(draft.descriptionDetail) !== draft.descriptionDetail) return { ok: false, reason: "invalid_snapshot" };
  } catch { return { ok: false, reason: "invalid_snapshot" }; }
  const computed = validateSupplierQuantityEntry({ nameVi: draft.name, grade: draft.grade, customGrade: draft.customGrade,
    incoterm: draft.incoterm, unit: draft.unit, tiers: draft.tiers }, draft.customGrade ? [] : [quantity.grade],
    { maxTiers: 4, maxPriceRatio: 1e12, maxLastMoqRatio: 1e12, gradeBounds: {} });
  if (!computed.value || computed.value.grade !== quantity.grade || computed.value.incoterm !== quantity.incoterm ||
      canonical(toQuantityRevisionV2(computed.value)) !== canonical(quantity.tiers) ||
      canonical(quantity) !== canonical({ grade: quantity.grade, incoterm: quantity.incoterm, tiers: quantity.tiers }))
    return { ok: false, reason: "invalid_snapshot" };
  if (Object.keys(draft.attributes).some((key) => reserved.has(key.trim().toLowerCase()))) return { ok: false, reason: "invalid_snapshot" };

  let originalSpecs: Record<string, unknown>;
  try { originalSpecs = structuredClone(product.specs ?? {}); }
  catch { return { ok: false, reason: "invalid_snapshot" }; }
  const rows = originalSpecs.grade_rows;
  if (rows != null && (!Array.isArray(rows) || rows.length > 1 || (rows.length === 1 &&
      (!object(rows[0]) || typeof rows[0].grade !== "string" || !rows[0].grade.trim() || normalize(rows[0].grade) !== normalize(quantity.grade)))))
    return { ok: false, reason: "legacy_grade_unmapped" };
  const capacity = draft.monthlyCapacityKg.trim();
  if (!capacity && product.monthly_capacity?.trim()) return { ok: false, reason: "legacy_capacity_unmapped" };
  if (capacity && (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(capacity) || Number(capacity.replace(/,/g, "")) < 1 ||
      !Number.isSafeInteger(Number(capacity.replace(/,/g, ""))) || Number(capacity.replace(/,/g, "")) > 1_000_000_000))
    return { ok: false, reason: "invalid_snapshot" };
  const days = draft.leadTimeDays.trim();
  if (days && (!/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 3650)) return { ok: false, reason: "invalid_snapshot" };
  const first = price.tiers[0], last = price.tiers[price.tiers.length - 1];
  // The old structured MOQ column only has two decimals. Do not round a more
  // precise kg/MT amount into that column; retain exact text and the v2 grams.
  const moqRequiresTextFallback = first.quantityGrams % (price.unitWeightGrams / 100) !== 0;
  const amount = v2InputDecimal(first.quantityGrams, price.unitWeightGrams);
  const specs = { ...originalSpecs, ...draft.attributes, grade: quantity.grade,
    lead_time: days ? { value: Number(days), unit: "days" } : { value: null, unit: "on_request" } };
  return { ok: true, moqRequiresTextFallback, patch: {
    name: draft.name.trim(), name_i18n: { ...product.name_i18n, en: validated.englishName },
    category: draft.category.trim(), reviewed_category_slug: draft.category.trim(),
    description: text(draft.description), description_detail: draft.descriptionDetail || null, spec: text(draft.spec), specs,
    raw_material_region: text(draft.rawMaterialRegion), input_material_origin: text(draft.inputMaterialOrigin),
    unit: price.unit === "mt" ? "MT" : "kg", moq: v2QuantityLabel(first.quantityGrams, price),
    moq_qty: moqRequiresTextFallback ? null : Number(amount), moq_unit: moqRequiresTextFallback ? null : price.unit,
    ref_price: last.priceCentsPerUnit / 100, ref_price_max: last.priceCentsPerUnit === first.priceCentsPerUnit ? null : first.priceCentsPerUnit / 100,
    currency: "USD", price_publicly_visible: draft.pricePubliclyVisible, incoterm: quantity.incoterm, incoterm_place: text(draft.incotermPlace),
    payment_terms: text(draft.paymentTerms), oem: draft.oem, odm: draft.odm, samples: draft.samples,
    packaging: text(draft.packaging), export_port: text(draft.exportPort), lead_time_days: days ? Number(days) : null,
    monthly_capacity: capacity ? `${capacity.replace(/,/g, "")} kg` : null,
  } };
}
