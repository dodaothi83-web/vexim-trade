import "server-only";

import { getStore } from "@/lib/db";
import { isExpired, productReadiness } from "@/lib/media/readiness";
import { listPublicSuppliers } from "@/lib/public/catalog";
import { isTestOnlyProduct, productBelongsToCategory, productGrade, productReviewApproved, publicProductPrice, withoutDirectContacts } from "@/lib/public/product-selection";
import type { Category, MediaAsset, SupplierProduct, VerificationLevel } from "@/lib/types";

/** The client receives only a public projection — never supplier contacts, private media or internal notes. */
export interface PublicCategoryProduct {
  id: string;
  name: string;
  grade: string | null;
  moq: string;
  price: string | null;
  province: string;
  verificationCount: number;
  verificationSteps: VerificationLevel[];
  supplierName: string;
  supplierId: string;
  supplierSlug: string | null;
  leadTimeDays: number | null;
  isDemo: boolean;
  imagePaths: string[];
}

export function shareableProductImages(media: MediaAsset[], productId: string, featuredMediaId?: string | null, limit = 6): string[] {
  return media.filter((m) => m.owner_type === "product" && m.product_id === productId &&
    m.kind === "image" && m.audience === "buyer" && m.storage_path && !isExpired(m))
    .sort((a, b) => Number(b.id === featuredMediaId) - Number(a.id === featuredMediaId) ||
      a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((m) => m.storage_path!)
    .slice(0, limit);
}

export async function listPublicCategoryProducts(category: Category): Promise<PublicCategoryProduct[]> {
  const store = getStore();
  const [suppliers, allProducts, knownCategories] = await Promise.all([
    listPublicSuppliers(), store.listProducts(), store.listCategories({ publishedOnly: false }),
  ]);
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const candidates = allProducts.filter((p) =>
    byId.has(p.supplier_id) && productReviewApproved(p) && !isTestOnlyProduct(p.name) &&
    (p.ready_for_buyer || byId.get(p.supplier_id)?.is_demo) &&
    productBelongsToCategory(p, category, knownCategories));
  const media: MediaAsset[] = [];
  // Bounded batches keep the Supabase URL and result size reasonable for large catalogs.
  for (let i = 0; i < candidates.length; i += 80) {
    media.push(...await store.listMediaForProducts(candidates.slice(i, i + 80).map((p) => p.id)));
  }
  const byProduct = new Map<string, MediaAsset[]>();
  for (const asset of media) {
    if (!asset.product_id) continue;
    const group = byProduct.get(asset.product_id) ?? [];
    if (!byProduct.has(asset.product_id)) byProduct.set(asset.product_id, group);
    group.push(asset);
  }
  return candidates.filter((p) => byId.get(p.supplier_id)?.is_demo || productReadiness(byProduct.get(p.id) ?? []).ready)
    .map((p: SupplierProduct) => {
      const s = byId.get(p.supplier_id)!;
      const images = shareableProductImages(byProduct.get(p.id) ?? [], p.id, p.featured_media_id);
      // A product marked ready can have only a catalogue; in that case show a neutral placeholder.
      return {
        id: p.id, name: withoutDirectContacts(p.name_i18n?.en || p.name), grade: productGrade(p.name, p.spec, category.slug),
        moq: p.moq || s.moq_text || "On request",
        price: publicProductPrice(p, s), province: s.province || "Vietnam",
        verificationCount: s.approved_verification_steps.length, verificationSteps: s.approved_verification_steps,
        supplierName: withoutDirectContacts(s.display_name || s.trade_name || s.name),
        supplierId: s.id, supplierSlug: s.slug || null, leadTimeDays: p.lead_time_days ?? null,
        isDemo: !!s.is_demo, imagePaths: images,
      };
    }).sort((a, b) => b.verificationCount - a.verificationCount || a.name.localeCompare(b.name));
}
