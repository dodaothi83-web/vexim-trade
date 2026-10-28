import "server-only";

import { localStore } from "@/lib/db/local";
import { supabaseConfigured, supabaseStore } from "@/lib/db/supabase";
import type { DataStore } from "@/lib/db/types";
import type { Category, Supplier, SupplierProduct } from "@/lib/types";
import { productReadiness } from "@/lib/media/readiness";
import { shareableProductImages } from "@/lib/public/product-catalog";
import { publicProductTitle } from "@/lib/public/display-name";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { isTestOnlyProduct, productReviewApproved, publicProductCategorySlug, withoutDirectContacts } from "@/lib/public/product-selection";
import type { PushCandidate } from "@/lib/sponsored/eligibility";

/**
 * Never fall back from the live request inbox to local data on a network error.
 * Local is supported only for an explicitly labelled development preview, never
 * on a production/staging deployment even when Supabase was not configured.
 */
export function sponsoredRequestStore(): DataStore | null {
  if (supabaseConfigured()) return supabaseStore;
  if (process.env.NODE_ENV === "production" || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development")) return null;
  return localStore;
}

/**
 * Same publication gates as the category catalogue, scoped to ONE supplier.
 * This uses the same category resolution, product/media readiness and demo gates;
 * it never reads another supplier's products. Re-run on submit, not only on render.
 */
export async function eligibleSupplierPushProducts(
  store: DataStore,
  supplier: Supplier,
  source?: { products: SupplierProduct[]; categories: Category[] },
): Promise<PushCandidate[]> {
  if (supplier.status !== "published" || isSyntheticSupplier(supplier)) return [];
  const [products, categories] = source ? [source.products, source.categories] : await Promise.all([
    store.listProductsBySupplier(supplier.id),
    store.listCategories({ publishedOnly: false }),
  ]);
  const own = products.filter((p) => p.supplier_id === supplier.id && productReviewApproved(p) &&
    !isTestOnlyProduct(p.name) && p.ready_for_buyer);
  const media = own.length ? await store.listMediaForProducts(own.map((p) => p.id)) : [];
  const byProduct = new Map<string, typeof media>();
  for (const item of media) {
    if (!item.product_id) continue;
    const rows = byProduct.get(item.product_id) ?? [];
    rows.push(item);
    byProduct.set(item.product_id, rows);
  }
  const candidates: PushCandidate[] = [];
  for (const p of own) {
    const slug = publicProductCategorySlug(p, categories);
    const category = categories.find((c) => c.slug === slug && c.status === "published" && c.is_published);
    const files = byProduct.get(p.id) ?? [];
    if (!category || !productReadiness(files).ready) continue;
    candidates.push({
      productId: p.id,
      name: withoutDirectContacts(publicProductTitle(p)).trim() || "Sản phẩm",
      categorySlug: category.slug,
      categoryName: category.name_i18n?.vi || category.name_i18n?.en || category.slug,
      supplierId: supplier.id,
      supplierName: withoutDirectContacts(supplier.display_name || supplier.trade_name || supplier.name).trim() || "Nhà cung cấp",
      imagePath: shareableProductImages(files, p.id, p.featured_media_id, 1, true)[0] ?? null,
    });
  }
  return candidates.sort((a, b) => a.categoryName.localeCompare(b.categoryName, "vi") || a.name.localeCompare(b.name, "vi") || a.productId.localeCompare(b.productId));
}
