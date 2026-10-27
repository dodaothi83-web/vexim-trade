/**
 * Search-only relevance and supplier rounds. All inputs must already be public,
 * sanitized and normalized; this module never reads supplier records or evidence.
 * It does not change marketplace ranking weights or the category/home feeds.
 */

export interface ProductSearchFields {
  /** Public product name and configured public attribute values, not the supplier. */
  product: string;
  /** The resolved public grade (structured grade takes precedence over the name). */
  grade: string;
  /** A configured public grade/type, or empty if the grade came from the name. */
  structuredGrade: string;
  /** Public category and public parent-category names. */
  category: string;
  /** Public supplier name and province, kept as a weaker fallback. */
  supplier: string;
}

export interface SearchRelevance {
  /** Alphanumeric specification codes matched by the product itself. */
  productCodes: number;
  /** Query tokens covered by the product or its public category, excluding the supplier. */
  coreTokens: number;
  /** Core tokens that match a complete word/code, not just part of a longer word. */
  wholeCoreTokens: number;
}

/** Match whole words without treating punctuation or Unicode letters as ASCII only. */
function wholeMatch(text: string, token: string): boolean {
  if (!token) return false;
  const word = /[\p{L}\p{N}]/u;
  let from = 0;
  for (;;) {
    const index = text.indexOf(token, from);
    if (index < 0) return false;
    const before = index > 0 ? Array.from(text.slice(0, index)).at(-1) ?? "" : "";
    const after = Array.from(text.slice(index + token.length))[0] ?? "";
    if (!word.test(before) && !word.test(after)) return true;
    from = index + 1;
  }
}

type Code = { family: string; number: string };
function parseCode(token: string, cashewAliases = false): Code | null {
  const match = /^([a-z]{1,3})(\d{2,5}[a-z]?)$/.exec(token);
  if (!match) return null;
  // WW320 and W320 are equivalent only in a cashew context. In another
  // industry, similar-looking prefixes may designate different products.
  const family = cashewAliases && /^w{1,2}$/.test(match[1]) ? "w" : match[1];
  return { family, number: match[2] };
}

function codesIn(text: string, cashewAliases = false): Code[] {
  return [...text.matchAll(/(?:^|[^\p{L}\p{N}])([a-z]{1,3}\d{2,5}[a-z]?)(?=$|[^\p{L}\p{N}])/gu)]
    .map((match) => parseCode(match[1], cashewAliases)).filter((code): code is Code => code !== null);
}

function sameCode(a: Code, b: Code): boolean {
  return a.family === b.family && a.number === b.number;
}

/** A different structured grade of the same family cannot be an exact grade match. */
function conflictingGrade(token: string, gradeCodes: readonly Code[], cashewAliases: boolean): boolean {
  const requested = parseCode(token, cashewAliases);
  if (!requested) return false;
  const family = gradeCodes.filter((code) => code.family === requested.family);
  return family.length > 0 && !family.some((code) => sameCode(code, requested));
}

function codeMatches(text: string, token: string, cashewAliases: boolean): boolean {
  if (wholeMatch(text, token)) return true;
  const code = parseCode(token, cashewAliases);
  if (!cashewAliases || !code || code.family !== "w") return false;
  return codesIn(text, true).some((candidate) => sameCode(code, candidate));
}

function hasCashewContext(fields: ProductSearchFields): boolean {
  return [fields.product, fields.category].some((text) => wholeMatch(text, "cashew") || wholeMatch(text, "hat dieu"));
}

/**
 * Require all query tokens, retaining the existing substring matches and treating
 * W/WW cashew grades as equivalents in product fields. The tuple orders results:
 * product codes first, then product/category coverage, then whole-word matches.
 * Supplier-only matches stay available but rank lower.
 */
export function productSearchRelevance(tokens: readonly string[], fields: ProductSearchFields): SearchRelevance | null {
  const core = `${fields.product} ${fields.grade}`;
  const all = `${core} ${fields.category} ${fields.supplier}`;
  const cashewAliases = tokens.some((token) => parseCode(token, true)?.family === "w") && hasCashewContext(fields);
  if (!tokens.every((token) => all.includes(token) ||
    (cashewAliases && parseCode(token, true)?.family === "w" && codeMatches(core, token, true)))) return null;
  const gradeCodes = codesIn(fields.structuredGrade, cashewAliases);
  const relevance: SearchRelevance = { productCodes: 0, coreTokens: 0, wholeCoreTokens: 0 };
  for (const token of tokens) {
    // A title or supplier may mention W320 even though the structured grade is
    // W240. Retain the result as a weak match, but never count that as W320.
    // A grade inferred from a name is not authoritative: names can list several.
    if (conflictingGrade(token, gradeCodes, cashewAliases)) continue;
    const wholeProduct = codeMatches(core, token, cashewAliases);
    if (parseCode(token) && wholeProduct) relevance.productCodes++;
    if (wholeProduct || core.includes(token) || fields.category.includes(token)) relevance.coreTokens++;
    if (wholeProduct || wholeMatch(fields.category, token)) relevance.wholeCoreTokens++;
  }
  return relevance;
}

/** Negative means a is more relevant than b. */
export function compareSearchRelevance(a: SearchRelevance, b: SearchRelevance): number {
  return b.productCodes - a.productCodes || b.coreTokens - a.coreTokens || b.wholeCoreTokens - a.wholeCoreTokens;
}

/**
 * First group by relevance. Within each group, each remaining supplier gets one
 * card per round; verification tier and the existing quality order decide the
 * order *inside* that round. Sort before pagination; no offers are capped.
 */
export function orderSearchProducts<E extends { product: { id: string; supplierId: string }; relevance: SearchRelevance }>(
  items: readonly E[],
  compareProducts: (a: E["product"], b: E["product"]) => number,
): E[] {
  const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const withinRound = (a: E, b: E) => compareProducts(a.product, b.product) || compareId(a.product.id, b.product.id);
  const sorted = [...items].sort((a, b) => compareSearchRelevance(a.relevance, b.relevance) || withinRound(a, b));
  const result: E[] = [];
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && compareSearchRelevance(sorted[start].relevance, sorted[end].relevance) === 0) end++;
    const bySupplier = new Map<string, { items: E[]; index: number }>();
    for (let i = start; i < end; i++) {
      const entry = sorted[i];
      const group = bySupplier.get(entry.product.supplierId) ?? { items: [], index: 0 };
      if (!bySupplier.has(entry.product.supplierId)) bySupplier.set(entry.product.supplierId, group);
      group.items.push(entry);
    }
    let active = [...bySupplier.values()];
    while (active.length) {
      active.sort((a, b) => withinRound(a.items[a.index], b.items[b.index]));
      for (const group of active) result.push(group.items[group.index++]);
      active = active.filter((group) => group.index < group.items.length);
    }
    start = end;
  }
  return result;
}
