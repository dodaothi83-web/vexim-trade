import "server-only";

import { getStore } from "@/lib/db";
import { publicProductAttributes } from "@/lib/product-attributes";
import { isExpired, productReadiness } from "@/lib/media/readiness";
import { listPublicSuppliers } from "@/lib/public/catalog";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { isTestOnlyProduct, pepperGrade, productBelongsToCategory, productGrade, productReviewApproved, publicProductPrice, publicProductPricePoint, withoutDirectContacts } from "@/lib/public/product-selection";
import type { Category, MediaAsset, SupplierProduct, VerificationLevel } from "@/lib/types";

/** The client receives only a public projection — never supplier contacts, private media or internal notes. */
export interface PublicCategoryProduct {
  id: string;
  name: string;
  grade: string | null;
  attributes: Record<string, string>;
  moq: string;
  price: string | null;
  /** Số liệu thô để tính khoảng giá tham khảo; null khi giá chưa được phép công khai. */
  pricePoint: { value: number; unit: string | null; currency: string | null; updatedAt: string | null } | null;
  /** Hồ sơ demo không được tham gia vào khoảng giá thị trường. */
  isDemoSupplier: boolean;
  province: string;
  verificationCount: number;
  verificationSteps: VerificationLevel[];
  supplierName: string;
  supplierId: string;
  supplierSlug: string | null;
  leadTimeDays: number | null;
  incoterm: string | null;
  oem: boolean;
  odm: boolean;
  samples: boolean;
  isDemo: boolean;
  imagePaths: string[];
  cardImagePath: string | null;
}

export function shareableProductImages(media: MediaAsset[], productId: string, featuredMediaId?: string | null, limit = 6, thumbnail = false): string[] {
  return media.filter((m) => m.owner_type === "product" && m.product_id === productId &&
    m.kind === "image" && m.audience === "buyer" && m.storage_path && !isExpired(m))
    .sort((a, b) => Number(b.id === featuredMediaId) - Number(a.id === featuredMediaId) ||
      a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((m) => thumbnail ? (m.thumb_path || m.storage_path!) : m.storage_path!)
    .slice(0, limit);
}

/**
 * Quy cách đã có sẵn trong trường dữ liệu của danh mục.
 *
 * Với quế và hồi, giá chênh ba lần giữa quế thanh và hoa hồi, nên gộp chung một
 * khoảng là con số đúng phép tính nhưng vô nghĩa với người mua. Trường
 * product_type đã tách sẵn hai mặt hàng đó, và đó cũng là thứ bộ lọc dùng.
 */
function declaredGrade(
  category: Pick<Category, "product_fields">,
  attributes: Record<string, string>,
): string | null {
  const keys = (category.product_fields ?? []).map((field) => field.key);
  for (const key of ["grade", "product_type"]) {
    if (keys.includes(key) && attributes[key]) return attributes[key];
  }
  return null;
}

export async function listPublicCategoryProducts(category: Category): Promise<PublicCategoryProduct[]> {
  const store = getStore();
  const [suppliers, allProducts, knownCategories] = await Promise.all([
    listPublicSuppliers(), store.listProducts(), store.listCategories({ publishedOnly: false }),
  ]);
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const candidates = allProducts.filter((p) =>
    byId.has(p.supplier_id) &&
    // A published test profile can be inspected at its own URL, but is not a market listing.
    (!isSyntheticSupplier(byId.get(p.supplier_id)!) || byId.get(p.supplier_id)?.is_demo) &&
    productReviewApproved(p) && !isTestOnlyProduct(p.name) &&
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
      const attributes = publicProductAttributes(category, p.specs);
      return {
        id: p.id, name: withoutDirectContacts(p.name_i18n?.en || p.name),
        grade: productGrade(p.name, p.spec, category.slug)
          ?? (category.slug === "pepper" ? pepperGrade(p.name, p.spec) : null)
          ?? declaredGrade(category, attributes),
        attributes,
        moq: p.moq || "On request",
        price: publicProductPrice(p, s), pricePoint: publicProductPricePoint(p, s), isDemoSupplier: !!s.is_demo, province: s.province || "Vietnam",
        verificationCount: s.approved_verification_steps.length, verificationSteps: s.approved_verification_steps,
        supplierName: withoutDirectContacts(s.display_name || s.trade_name || s.name),
        supplierId: s.id, supplierSlug: s.slug || null, leadTimeDays: p.lead_time_days ?? null, incoterm: p.incoterm ?? null, oem: !!p.oem, odm: !!p.odm, samples: !!p.samples,
        isDemo: !!s.is_demo, imagePaths: images,
        cardImagePath: shareableProductImages(byProduct.get(p.id) ?? [], p.id, p.featured_media_id, 1, true)[0] ?? null,
      };
    }).sort((a, b) => b.verificationCount - a.verificationCount || a.name.localeCompare(b.name));
}
