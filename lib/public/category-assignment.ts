import type { Category, SupplierProduct } from "@/lib/types";

export type CategoryChoice = Pick<Category, "id" | "slug" | "name_i18n"> & Partial<Pick<Category, "parent_id">>;
export type ProductForAssignment = Pick<SupplierProduct, "name" | "spec" | "description" | "category">;

const normalize = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const includesTerm = (text: string, term: string) => new RegExp(`(?:^|[^a-z0-9])${normalize(term).replace(/[^a-z0-9 ]/g, "\\$&")}(?:$|[^a-z0-9])`).test(text);

/**
 * Most specific commodities before broad parents. No model call or background jobs.
 * `slugs` lists the live slug first, then older/broader slugs: a rule lands on the
 * first one the catalog has, so "Hoa hồi" goes to the star-anise child once Vexim
 * splits it out and to "Quế và hồi" before that. `over` drops a sibling rule when
 * both match (roasted cashews are usually also sold by W-grade).
 */
type Rule = { key: string; slugs: string[]; terms: string[]; over?: string[] };
const RULES: Rule[] = [
  { key: "noodles", slugs: ["noodles"], terms: ["rice noodles", "rice paper", "vermicelli", "instant noodles", "pho noodles", "banh trang", "bun gao", "mi an lien"] },
  { key: "dried-fruit", slugs: ["dried-fruits", "dried-fruit"], terms: ["dried mango", "dried fruit", "dried jackfruit", "mango chips", "freeze dried", "freeze-dried", "trai cay say", "say thang hoa", "say deo"] },
  { key: "frozen-fruit", slugs: ["frozen-fruits"], terms: ["frozen fruit", "iqf", "trai cay dong lanh"] },
  { key: "dragon-fruit", slugs: ["dragon-fruit"], terms: ["dragon fruit", "thanh long"] },
  { key: "star-anise", slugs: ["star-anise", "cinnamon-star-anise"], terms: ["star anise", "hoa hoi", "hat hoi", "hoi sao"] },
  { key: "pangasius", slugs: ["pangasius", "seafood-processed-fisheries-products"], terms: ["pangasius", "ca tra", "basa fish"] },
  { key: "shrimp", slugs: ["shrimp", "seafood-processed-fisheries-products"], terms: ["shrimp", "prawn", "tom su", "tom the"] },
  { key: "cashew-roasted", slugs: ["roasted-cashews"], over: ["cashew-raw"], terms: ["roasted cashew", "roasted cashews", "salted cashew", "honey cashew", "flavored cashew", "flavoured cashew", "seasoned cashew", "cashew snack", "dieu rang", "rang muoi", "dieu tam", "tam vi", "dieu mat ong"] },
  { key: "cashew-raw", slugs: ["raw-cashew-kernels"], terms: ["raw cashew", "white whole", "w180", "w210", "w240", "w320", "w450", "ww180", "ww240", "ww320", "ww450", "lbw", "cashew splits", "cashew pieces", "cashew butts", "nhan dieu tho", "dieu tho"] },
  { key: "cashew", slugs: ["cashew-kernels", "cashew"], terms: ["cashew", "hat dieu", "nhan dieu", "dieu w180", "dieu w240", "dieu w320", "dieu w450"] },
  { key: "macadamia", slugs: ["macadamia"], terms: ["macadamia"] },
  { key: "rice", slugs: ["rice-grain-products", "rice"], terms: ["rice", "gao", "jasmine rice", "st25", "japonica"] },
  { key: "cinnamon", slugs: ["cassia-cinnamon", "cinnamon", "cinnamon-star-anise"], terms: ["cinnamon", "cassia", "que ong", "que thanh", "que cay", "vo que"] },
  { key: "pepper", slugs: ["pepper", "pepper-spices"], terms: ["black pepper", "white pepper", "peppercorn", "ho tieu", "tieu den", "tieu trang"] },
  { key: "coffee", slugs: ["coffee", "coffee-tea-specialty-beverages"], terms: ["coffee", "robusta", "arabica", "ca phe", "espresso"] },
  { key: "tea", slugs: ["tea", "coffee-tea-specialty-beverages"], terms: ["tea", "tra xanh", "tra den", "oolong", "matcha", "tra thao moc", "herbal tea"] },
  { key: "coconut", slugs: ["coconut"], terms: ["coconut", "dua ben tre", "dua say", "desiccated coconut"] },
  { key: "honey", slugs: ["honey"], terms: ["honey", "mat ong"] },
  { key: "seafood", slugs: ["seafood-processed-fisheries-products", "seafood"], terms: ["seafood", "hai san", "squid", "muc dong lanh"] },
];

// Older taxonomy (no parent_id on the mock/legacy rows): child slug → parent slug.
const LEGACY_PARENT: Record<string, string> = {
  noodles: "rice", pangasius: "seafood", shrimp: "seafood",
  pepper: "pepper-spices", cinnamon: "pepper-spices", "star-anise": "pepper-spices",
  "dragon-fruit": "fruit-veg", "dried-fruit": "fruit-veg", cashew: "nuts-kernels",
};

function inCatalog(slug: string, categories: CategoryChoice[]): CategoryChoice | null {
  return categories.find((c) => c.slug.toLowerCase() === slug) ?? null;
}

/** `parent` is the direct parent of `child` in the CMS tree (or the legacy map). */
function isParentOf(parent: CategoryChoice, child: CategoryChoice, categories: CategoryChoice[]): boolean {
  if (child.parent_id) return child.parent_id === parent.id;
  const legacy = LEGACY_PARENT[child.slug];
  return !!legacy && inCatalog(legacy, categories)?.id === parent.id;
}

function detect(text: string, categories: CategoryChoice[]): CategoryChoice[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  const matched = RULES.filter((rule) => rule.terms.some((term) => includesTerm(normalized, term)));
  const dropped = new Set(matched.flatMap((rule) => rule.over ?? []));
  const found = new Set<string>();
  for (const rule of matched) {
    if (dropped.has(rule.key)) continue;
    const slug = rule.slugs.find((candidate) => inCatalog(candidate, categories));
    if (slug) found.add(slug);
  }
  // Use exact category label/slug as a fallback for categories added in CMS.
  for (const c of categories) {
    if (includesTerm(normalized, c.slug) || (c.name_i18n.en && includesTerm(normalized, c.name_i18n.en))) found.add(c.slug);
  }
  const hits = categories.filter((c) => found.has(c.slug));
  // Specific child wins when a text mentions both parent and child (e.g. rice noodles).
  return hits.filter((c) => !hits.some((child) => child !== c && isParentOf(c, child, categories)));
}

/** A product may be auto-assigned from its own name, then spec/description, then its supplier. */
export function assignProductCategory(
  product: ProductForAssignment,
  categories: CategoryChoice[],
  supplierCategories: string[] = [],
): CategoryChoice | null {
  const specific = detect(product.name, categories);
  if (specific.length === 1) return specific[0];
  if (specific.length > 1) return null; // Mixed commodity: do not publish in an arbitrary category.
  const details = detect(`${product.spec ?? ""} ${product.description ?? ""}`, categories);
  if (details.length === 1) return details[0];
  if (details.length > 1) return null;
  const previous = normalize(product.category ?? "");
  const legacy = previous === "dieu" ? "cashew" : previous === "gao" ? "rice" : previous;
  if (inCatalog(legacy, categories)) return inCatalog(legacy, categories);
  const fallback = supplierCategories.filter((slug) => inCatalog(slug, categories));
  return fallback.length === 1 ? inCatalog(fallback[0], categories) : null;
}

/**
 * Up to `limit` categories the product name points at, most specific first: what the
 * category picker shows as "Ngành hàng gợi ý". Unlike `assignProductCategory` a mixed
 * name returns every candidate, because the supplier picks — nothing is auto-saved.
 */
export function suggestProductCategories(name: string, categories: CategoryChoice[], limit = 3): CategoryChoice[] {
  return detect(name, categories).slice(0, limit);
}

/** NCC can supply several industries. Products drive membership; free-text products is secondary. */
export function assignSupplierCategories(
  supplierProductsText: string | null,
  products: Array<Pick<SupplierProduct, "name" | "category" | "spec" | "description">>,
  categories: CategoryChoice[],
): { ids: string[]; primaryId: string | null; slugs: string[] } {
  const counts = new Map<string, number>();
  for (const p of products) {
    const match = assignProductCategory(p, categories);
    if (match) counts.set(match.slug, (counts.get(match.slug) ?? 0) + 1);
  }
  const mentioned = detect(supplierProductsText ?? "", categories);
  for (const c of mentioned) if (!counts.has(c.slug)) counts.set(c.slug, 0);
  const ordered = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) ||
    categories.findIndex((c) => c.slug === a) - categories.findIndex((c) => c.slug === b));
  return { slugs: ordered, ids: ordered.map((slug) => inCatalog(slug, categories)!.id),
    primaryId: ordered.length ? inCatalog(ordered[0], categories)!.id : null };
}
