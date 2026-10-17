import type { Category, SupplierProduct } from "@/lib/types";

import { assignProductCategory } from "@/lib/public/category-assignment";

/** The product itself wins over a stale or incorrect saved category on public reads. */
export function productBelongsToCategory(
  product: Pick<SupplierProduct, "category" | "name"> & Partial<Pick<SupplierProduct, "spec" | "description" | "reviewed_category_slug" | "supplier_originated">>,
  category: Pick<Category, "slug">,
  knownCategories: Pick<Category, "slug" | "name_i18n">[],
): boolean {
  // Supplier-authored products never fall back to keyword inference after a decision was invalidated.
  if (product.supplier_originated && !product.reviewed_category_slug) return false;
  // Explicit human decision wins over a keyword guess. An invalid/archived slug fails closed.
  if (product.reviewed_category_slug) return product.reviewed_category_slug === category.slug &&
    knownCategories.some((c) => c.slug === product.reviewed_category_slug);
  const choices = knownCategories.map((c) => ({ ...c, id: c.slug }));
  const inferred = assignProductCategory({
    name: product.name, category: product.category,
    spec: product.spec ?? null, description: product.description ?? null,
  }, choices);
  return inferred?.slug === category.slug;
}

export function productReviewApproved(product: Pick<SupplierProduct, "supplier_review_status"> & Partial<Pick<SupplierProduct, "supplier_originated" | "reviewed_category_slug">>): boolean {
  // A supplier-authored product without a current Vexim category decision fails closed.
  // Historical/staff-managed products (no supplier_originated flag) preserve their prior behavior.
  if (product.supplier_originated && !product.reviewed_category_slug) return false;
  return product.supplier_review_status === "approved" || product.supplier_review_status == null;
}

export function isTestOnlyProduct(name: string): boolean {
  return /^\s*(?:\[\s*)?test\s+only\b/i.test(name);
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

/** Consent belongs to the supplier, expires after 180 days, and is never renewed by a normal product edit. */
export function supplierPriceConsentCurrent(supplier: { fob_publicly_visible?: boolean; fob_updated_at?: string | null }, now = Date.now()): boolean {
  if (!supplier.fob_publicly_visible || !supplier.fob_updated_at) return false;
  const age = now - new Date(supplier.fob_updated_at).getTime();
  return Number.isFinite(age) && age >= 0 && age < 180 * 86400_000;
}

/** Product ref price is public only when separately opted in, consent is current and the price is valid. */
export function publicProductPrice(
  product: Pick<SupplierProduct, "ref_price" | "currency" | "price_valid_until" | "unit" | "price_publicly_visible">,
  supplier: { fob_publicly_visible?: boolean; fob_updated_at?: string | null },
  today: string = new Date().toISOString().slice(0, 10),
): string | null {
  if (!product.price_publicly_visible || !supplierPriceConsentCurrent(supplier) || product.ref_price == null || product.ref_price <= 0) return null;
  if (product.price_valid_until && product.price_valid_until < today) return null;
  const currency = product.currency || "USD";
  // The CRM currency can already contain a unit (e.g. USD/kg); never invent a conversion to /ton.
  return `${currency} ${product.ref_price.toLocaleString("en-US")}${currency.includes("/") ? "" : product.unit ? `/${product.unit}` : ""}`;
}
