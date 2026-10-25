export const MAX_PRODUCT_COMPARISONS = 3;

export interface ProductComparisonSelection {
  id: string;
  name: string;
  href: string;
  imagePath: string | null;
  categorySlug: string;
}

export type ProductComparisonToggleResult = "added" | "removed" | "limit" | "invalid";

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,99}$/i;

export function parseComparisonIds(raw: string | undefined, limit: number): string[] {
  if (!raw || limit < 1) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || !ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export function productDetailHref(categorySlug: string, productId: string): string {
  return `/products/${encodeURIComponent(categorySlug)}/${encodeURIComponent(productId)}`;
}

export function productComparisonHref(productIds: readonly string[]): string {
  const ids = parseComparisonIds(productIds.join(","), MAX_PRODUCT_COMPARISONS);
  return ids.length ? `/compare?products=${ids.map(encodeURIComponent).join(",")}` : "/compare";
}

function safeImagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.trim().replace(/^\/+/, "");
  if (!path || path.length > 500 || /[?#\\\u0000-\u001f]/.test(path) || path.includes("..") || path.includes("://")) return null;
  return path;
}

/** Rebuild local selections from trusted primitives instead of trusting persisted URLs. */
export function normalizeProductComparisonSelection(raw: unknown, limit = MAX_PRODUCT_COMPARISONS): ProductComparisonSelection[] {
  if (!Array.isArray(raw) || limit < 1) return [];
  const result: ProductComparisonSelection[] = [];
  const seen = new Set<string>();
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const categorySlug = typeof item.categorySlug === "string" ? item.categorySlug.trim() : "";
    if (!ID_PATTERN.test(id) || !ID_PATTERN.test(categorySlug) || seen.has(id)) continue;
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 240) : "Product";
    seen.add(id);
    result.push({
      id,
      name,
      categorySlug,
      href: productDetailHref(categorySlug, id),
      imagePath: safeImagePath(item.imagePath),
    });
    if (result.length >= limit) break;
  }
  return result;
}

export function toggleProductComparisonSelection(
  current: readonly ProductComparisonSelection[],
  candidate: ProductComparisonSelection,
): { items: ProductComparisonSelection[]; result: ProductComparisonToggleResult } {
  const items = normalizeProductComparisonSelection(current);
  const product = normalizeProductComparisonSelection([candidate])[0];
  if (!product) return { items, result: "invalid" };
  if (items.some((item) => item.id === product.id)) {
    return { items: items.filter((item) => item.id !== product.id), result: "removed" };
  }
  if (items.length >= MAX_PRODUCT_COMPARISONS) return { items, result: "limit" };
  return { items: [...items, product], result: "added" };
}

export interface ProductComparisonWarningInput {
  categorySlug: string;
  price: string | null;
  priceCurrency: string | null;
  priceUnit: string | null;
  priceValidUntil: string | null;
  moq: string | null;
  incoterm: string | null;
  incotermPlace: string | null;
}

function normalized(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function priceBasis(product: ProductComparisonWarningInput): { currency: string; unit: string } {
  const [rawCurrency, currencyUnit] = (product.priceCurrency ?? "").split("/");
  return {
    currency: normalized(rawCurrency),
    unit: normalized(product.priceUnit || currencyUnit || null),
  };
}

/** Warnings never convert prices or choose a winner; they only identify unlike comparison bases. */
export function productComparisonWarnings(products: readonly ProductComparisonWarningInput[]): string[] {
  const warnings: string[] = [];
  if (new Set(products.map((product) => product.categorySlug)).size > 1) {
    warnings.push("These products belong to different categories. Compare only shared terms; their product specifications may not be equivalent.");
  }

  const priced = products.filter((product) => Boolean(product.price));
  if (priced.length < products.length) {
    warnings.push("Some products do not have a public reference price. Request a quote to compare current prices.");
  }
  if (priced.length < 2) return warnings;

  const bases = priced.map(priceBasis);
  if (new Set(bases.map((basis) => basis.currency)).size > 1 || bases.some((basis) => !basis.currency)) {
    warnings.push("Reference prices use different or unclear currencies and are not directly comparable.");
  }
  if (new Set(bases.map((basis) => basis.unit)).size > 1 || bases.some((basis) => !basis.unit)) {
    warnings.push("Reference prices use different or unclear units and are not directly comparable.");
  }

  const quantities = priced.map((product) => normalized(product.moq));
  if (new Set(quantities).size > 1 || quantities.some((quantity) => !quantity || quantity === "on request" || quantity === "not provided")) {
    warnings.push("Reference prices may apply to different or unclear minimum quantities. Confirm the quantity for each quote before comparing prices.");
  }

  const validityDates = priced.map((product) => normalized(product.priceValidUntil));
  if (new Set(validityDates).size > 1 || validityDates.some((date) => !date)) {
    warnings.push("Price validity dates differ or are not stated. Confirm that all reference prices are current for the same buying period.");
  }

  const deliveryScopes = priced.map((product) => `${normalized(product.incoterm)}|${normalized(product.incotermPlace)}`);
  if (new Set(deliveryScopes).size > 1 || priced.some((product) => !normalized(product.incoterm) || !normalized(product.incotermPlace))) {
    warnings.push("Incoterms or named places differ or are not stated. These reference prices do not represent a clearly matching delivery scope.");
  }
  return warnings;
}
