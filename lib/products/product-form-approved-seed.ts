import { parseProductFormDraft, type ProductFormDraft } from "@/lib/products/product-form-model";
import { validateSupplierQuantityEntry } from "@/lib/products/quantity-entry";
import { readQuantityRevisionV2, toQuantityRevisionV2 } from "@/lib/products/quantity-revision-v2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const canonical = (value: unknown): string | undefined => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

type Result = { ok: true; draft: ProductFormDraft } | { ok: false; reason: "invalid_link" | "product_changed" | "invalid_snapshot" };

/**
 * Restore an approved form exactly, including its explicitly entered kg/month.
 * Caller must authorize access and obtain all rows server-side. A future atomic
 * approval must record the resulting product updated_at on the submission; an
 * absent or different timestamp fails closed. Never infer a capacity unit from
 * the product's legacy monthly_capacity text or reuse consent for a new price.
 * This helper is not connected to a route or publication writer.
 */
export function seedFromLinkedApprovedForm(input: {
  product: { id: string; supplier_id: string; updated_at: string };
  priceRevision: { id: string; product_id: string; status: string; grade: unknown; incoterm: unknown; tiers: unknown };
  submission: { id: string; product_id: string; supplier_id: string; status: string; approved_price_revision_id: unknown;
    approved_product_updated_at: unknown; payload: unknown; quantity: unknown };
}): Result {
  const { product, priceRevision: price, submission } = input;
  if (![product.id, product.supplier_id, price.id, price.product_id, submission.id, submission.product_id, submission.supplier_id]
        .every((value) => typeof value === "string" && UUID.test(value)) ||
      submission.status !== "approved" || price.status !== "approved" || product.id !== price.product_id ||
      product.id !== submission.product_id || product.supplier_id !== submission.supplier_id || submission.approved_price_revision_id !== price.id)
    return { ok: false, reason: "invalid_link" };
  if (typeof product.updated_at !== "string" || !Number.isFinite(Date.parse(product.updated_at)) ||
      typeof submission.approved_product_updated_at !== "string" || !submission.approved_product_updated_at ||
      product.updated_at !== submission.approved_product_updated_at)
    return { ok: false, reason: "product_changed" };
  const draft = parseProductFormDraft(submission.payload), quantity = submission.quantity;
  const parsedPrice = readQuantityRevisionV2(price.tiers);
  if (!draft || !object(quantity) || !parsedPrice || typeof price.grade !== "string" || typeof price.incoterm !== "string" ||
      (draft.pricePubliclyVisible && !draft.priceConsent)) return { ok: false, reason: "invalid_snapshot" };
  const capacity = draft.monthlyCapacityKg.trim();
  if (capacity && (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(capacity) ||
      !Number.isSafeInteger(Number(capacity.replace(/,/g, ""))) || Number(capacity.replace(/,/g, "")) < 1 ||
      Number(capacity.replace(/,/g, "")) > 1_000_000_000)) return { ok: false, reason: "invalid_snapshot" };
  // Recompute exact integer grams and cents from the snapshot. These permissive
  // bounds are used only for consistency, not to approve under current policy.
  const recomputed = validateSupplierQuantityEntry({ nameVi: draft.name, grade: draft.grade, customGrade: draft.customGrade,
    incoterm: draft.incoterm, unit: draft.unit, tiers: draft.tiers }, draft.customGrade ? [] : [price.grade],
    { maxTiers: 4, maxPriceRatio: 1e12, maxLastMoqRatio: 1e12, gradeBounds: {} });
  if (!recomputed.value || recomputed.value.grade !== price.grade || recomputed.value.incoterm !== price.incoterm ||
      canonical(toQuantityRevisionV2(recomputed.value)) !== canonical(price.tiers) ||
      canonical(quantity) !== canonical({ grade: price.grade, incoterm: price.incoterm, tiers: price.tiers }))
    return { ok: false, reason: "invalid_snapshot" };
  return { ok: true, draft: { ...draft, priceConsent: false } };
}
