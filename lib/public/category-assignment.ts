import type { Category, SupplierProduct } from "@/lib/types";

export type CategoryChoice = Pick<Category, "id" | "slug" | "name_i18n">;
export type ProductForAssignment = Pick<SupplierProduct, "name" | "spec" | "description" | "category">;

const normalize = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const includesTerm = (text: string, term: string) => new RegExp(`(?:^|[^a-z0-9])${normalize(term).replace(/[^a-z0-9 ]/g, "\\$&")}(?:$|[^a-z0-9])`).test(text);

// Most specific commodities before broad parents. No model call or background jobs.
const RULES: Array<[string, string[]]> = [
  ["noodles", ["rice noodles", "rice paper", "vermicelli", "instant noodles", "pho noodles", "banh trang", "bun gao", "mi an lien"]],
  ["dried-fruit", ["dried mango", "dried fruit", "dried jackfruit", "mango chips", "trai cay say"]],
  ["dragon-fruit", ["dragon fruit", "thanh long"]],
  ["star-anise", ["star anise", "hoa hoi"]],
  ["pangasius", ["pangasius", "ca tra", "basa fish"]],
  ["shrimp", ["shrimp", "prawn", "tom su", "tom the"]],
  ["cashew", ["cashew", "hat dieu", "nhan dieu", "dieu w180", "dieu w240", "dieu w320", "dieu w450"]],
  ["macadamia", ["macadamia"]],
  ["rice", ["rice", "gao", "jasmine rice", "st25", "japonica"]],
  ["cinnamon", ["cinnamon", "cassia", "que ong", "que thanh"]],
  ["pepper", ["black pepper", "white pepper", "peppercorn", "ho tieu", "tieu den", "tieu trang"]],
  ["coffee", ["coffee", "robusta", "arabica", "ca phe"]],
  ["coconut", ["coconut", "dua ben tre", "dua say", "desiccated coconut"]],
  ["honey", ["honey", "mat ong"]],
  ["tea", ["tea", "tra xanh", "tra den", "oolong"]],
  ["seafood", ["seafood", "hai san", "squid", "muc dong lanh"]],
];

function inCatalog(slug: string, categories: CategoryChoice[]): CategoryChoice | null {
  return categories.find((c) => c.slug.toLowerCase() === slug) ?? null;
}

function detect(text: string, categories: CategoryChoice[]): CategoryChoice[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  const found = new Set<string>();
  for (const [slug, terms] of RULES) {
    if (terms.some((term) => includesTerm(normalized, term)) && inCatalog(slug, categories)) found.add(slug);
  }
  // Use exact category label/slug as a fallback for categories added in CMS.
  for (const c of categories) {
    if (includesTerm(normalized, c.slug) || (c.name_i18n.en && includesTerm(normalized, c.name_i18n.en))) found.add(c.slug);
  }
  return categories.filter((c) => found.has(c.slug));
}

/** A product may be auto-assigned from its own name, then spec/description, then its supplier. */
export function assignProductCategory(
  product: ProductForAssignment,
  categories: CategoryChoice[],
  supplierCategories: string[] = [],
): CategoryChoice | null {
  const nameMatches = detect(product.name, categories);
  // Specific child wins when a name mentions both parent and child (e.g. rice noodles).
  const parentOf: Record<string, string> = {
    noodles: "rice", pangasius: "seafood", shrimp: "seafood",
    pepper: "pepper-spices", cinnamon: "pepper-spices", "star-anise": "pepper-spices",
    "dragon-fruit": "fruit-veg", "dried-fruit": "fruit-veg", cashew: "nuts-kernels",
  };
  const specific = nameMatches.filter((c) => !nameMatches.some((child) => parentOf[child.slug] === c.slug));
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
