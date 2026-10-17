import type { Category, SupplierProduct } from "@/lib/types";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const aliases: Record<string, string> = { dieu: "cashew", "cashew kernels": "cashew", gao: "rice" };

/** Only the product's OWN category is authoritative, never supplier descriptions or other products. */
export function productBelongsToCategory(
  product: Pick<SupplierProduct, "category" | "name">,
  category: Pick<Category, "slug">,
  knownCategories: Pick<Category, "slug" | "name_i18n">[],
): boolean {
  const value = normalize(product.category ?? "");
  if (!value || (aliases[value] ?? value) !== category.slug.toLowerCase()) return false;
  const name = normalize(product.name);
  const current = knownCategories.find((c) => c.slug === category.slug);
  const namesFor = (c: Pick<Category, "slug" | "name_i18n">) => [
    normalize(c.slug), normalize(c.name_i18n?.en ?? ""),
    ...Object.entries(aliases).filter(([, slug]) => slug === c.slug).map(([alias]) => alias),
  ].filter((part) => part.length > 2);
  const mentions = (terms: string[]) => terms.some((term) => new RegExp(`(?:^|[^a-z])${term.replace(/[^a-z0-9 ]/g, "\\$&")}(?:$|[^a-z])`, "i").test(name));
  // If a product explicitly names another known commodity and not this one, quarantine it.
  // Include basic identities even if the other category has not been published yet.
  const identities = [...knownCategories];
  for (const basic of [{ slug: "rice", name_i18n: { en: "Rice" } }, { slug: "cashew", name_i18n: { en: "Cashew" } }]) {
    if (!identities.some((c) => c.slug === basic.slug)) identities.push(basic);
  }
  // The data must be corrected in CRM; do not silently reassign it to the inferred category.
  return !identities.some((c) => c.slug !== category.slug && mentions(namesFor(c))) ||
    Boolean(current && mentions(namesFor(current)));
}

export function withoutDirectContacts(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[contact via Vexim]")
    .replace(/(?:\+?\d[\s().-]?){9,15}\d/g, "[contact via Vexim]");
}

export function productGrade(name: string, spec: string | null, categorySlug: string): string | null {
  if (categorySlug !== "cashew") return null;
  const text = `${name} ${spec ?? ""}`.toUpperCase();
  const code = /\b(W180|W240|W320|W450|SW|WS|LP|SP)\b/.exec(text)?.[1];
  if (code) return code;
  if (/\bSPLITS?\b/.test(text)) return "WS";
  if (/\bPIECES?\b/.test(text)) return "LP";
  return null;
}

/** Product ref price is public only when supplier consent is current and product price has not expired. */
export function publicProductPrice(
  product: Pick<SupplierProduct, "ref_price" | "currency" | "price_valid_until" | "unit">,
  supplier: { fob_publicly_visible?: boolean; fob_updated_at?: string | null },
  today: string = new Date().toISOString().slice(0, 10),
): string | null {
  if (!supplier.fob_publicly_visible || !supplier.fob_updated_at || product.ref_price == null || product.ref_price <= 0) return null;
  const age = Date.now() - new Date(supplier.fob_updated_at).getTime();
  if (!Number.isFinite(age) || age < 0 || age > 180 * 86400_000) return null;
  if (product.price_valid_until && product.price_valid_until < today) return null;
  const currency = product.currency || "USD";
  // The CRM currency can already contain a unit (e.g. USD/kg); never invent a conversion to /ton.
  return `${currency} ${product.ref_price.toLocaleString("en-US")}${currency.includes("/") ? "" : product.unit ? `/${product.unit}` : ""}`;
}
