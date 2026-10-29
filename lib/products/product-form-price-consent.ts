/** Only the two consent flags are projected from a private approved submission. */
export type ApprovedFormPriceConsent = {
  product_id: unknown;
  supplier_id: unknown;
  status: unknown;
  approved_price_revision_id: unknown;
  price_consent: unknown;
  price_publicly_visible: unknown;
};

/**
 * Return null only when no approved form exists, so callers may retain their
 * existing legacy consent policy. Once a product has an approved form, an old,
 * missing or invalid price link fails closed rather than using a legacy opt-in.
 * The link must be created by the future atomic approval transaction.
 * This function makes no DB call and never exposes the full private payload.
 */
export function approvedFormPriceConsent(input: {
  record: ApprovedFormPriceConsent | null; productId: string; supplierId: string;
  priceRevision: { id: string; product_id: string; status: string } | null;
}): boolean | null {
  const { record, productId, supplierId, priceRevision } = input;
  if (!record) return null;
  if (!priceRevision || record.approved_price_revision_id !== priceRevision.id) return false;
  return priceRevision.status === "approved" && priceRevision.product_id === productId && record.status === "approved" &&
    record.product_id === productId && record.supplier_id === supplierId &&
    record.price_consent === true && record.price_publicly_visible === true;
}
