/**
 * A product-page RFQ stores `product_text` as "<verified product name>. <what the buyer
 * typed>" (supplier notifications and search rely on that full text). Screens that
 * already label the product must show the buyer's own words separately instead of
 * repeating the product name.
 */
export interface RfqProductParts {
  /** Verified product name, or the buyer's free-text description for a general RFQ. */
  product: string;
  /** Buyer's own requirements typed under the product name; null when they typed none. */
  requirements: string | null;
}

/** Name of the verified product this RFQ was sent from (specs.product_ref), if any. */
export function rfqProductRefName(specs: unknown): string | null {
  const ref = (specs as { product_ref?: { name?: unknown } | null } | null)?.product_ref;
  return typeof ref?.name === "string" && ref.name.trim() ? ref.name.trim() : null;
}

export function splitRfqProductText(productText: string | null | undefined, productName: string | null | undefined): RfqProductParts {
  const text = (productText ?? "").trim();
  const name = (productName ?? "").trim();
  if (!name || !text.toLowerCase().startsWith(name.toLowerCase())) return { product: text, requirements: null };
  const requirements = text.slice(name.length).replace(/^[\s.:·–-]+/, "").trim();
  return { product: text.slice(0, name.length), requirements: requirements || null };
}

/** Split an RFQ row using its own verified product reference. */
export function rfqProductParts(rfq: { product_text: string | null | undefined; specs?: unknown }): RfqProductParts {
  return splitRfqProductText(rfq.product_text, rfqProductRefName(rfq.specs));
}
