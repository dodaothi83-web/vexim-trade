import "server-only";

import { getStore } from "@/lib/db";
import { isExpired } from "@/lib/media/readiness";
import { listPublicSuppliers, verificationBadge } from "@/lib/public/catalog";
import { isTestOnlyProduct, productBelongsToCategory, productGrade, publicProductPrice, withoutDirectContacts } from "@/lib/public/product-selection";
import type { Category, MediaAsset, SupplierProduct } from "@/lib/types";

/** The client receives only a public projection — never supplier contacts, private media or internal notes. */
export interface PublicCategoryProduct {
  id: string;
  name: string;
  grade: string | null;
  moq: string;
  price: string | null;
  province: string;
  verificationLevel: number;
  verificationLabel: string;
  supplierName: string;
  supplierId: string;
  isDemo: boolean;
  imagePaths: string[];
}

export function shareableProductImages(media: MediaAsset[], productId: string): string[] {
  return media.filter((m) => m.owner_type === "product" && m.product_id === productId &&
    m.kind === "image" && m.audience === "buyer" && m.storage_path && !isExpired(m))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((m) => m.storage_path!)
    .slice(0, 6);
}

export async function listPublicCategoryProducts(category: Category): Promise<PublicCategoryProduct[]> {
  const store = getStore();
  const [suppliers, allProducts, knownCategories] = await Promise.all([
    listPublicSuppliers(), store.listProducts(), store.listCategories({ publishedOnly: false }),
  ]);
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const candidates = allProducts.filter((p) =>
    byId.has(p.supplier_id) && !isTestOnlyProduct(p.name) &&
    (p.ready_for_buyer || byId.get(p.supplier_id)?.is_demo) &&
    productBelongsToCategory(p, category, knownCategories));
  const media: MediaAsset[] = [];
  // Bounded batches keep the Supabase URL and result size reasonable for large catalogs.
  for (let i = 0; i < candidates.length; i += 80) {
    media.push(...await store.listMediaForProducts(candidates.slice(i, i + 80).map((p) => p.id)));
  }
  return candidates.map((p: SupplierProduct) => {
    const s = byId.get(p.supplier_id)!;
    const images = shareableProductImages(media, p.id);
    // A product marked ready can have only a catalogue; in that case show a neutral placeholder.
    return {
      id: p.id, name: withoutDirectContacts(p.name_i18n?.en || p.name), grade: productGrade(p.name, p.spec, category.slug),
      moq: p.moq || s.moq_text || "On request",
      price: publicProductPrice(p, s), province: s.province || "Vietnam",
      verificationLevel: s.verification_level ?? 0, verificationLabel: verificationBadge(s).text,
      supplierName: withoutDirectContacts(s.display_name || s.trade_name || s.name),
      supplierId: s.id, isDemo: !!s.is_demo, imagePaths: images,
    };
  }).sort((a, b) => b.verificationLevel - a.verificationLevel || a.name.localeCompare(b.name));
}
