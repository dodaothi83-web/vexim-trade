import type { Category, MediaAsset, Rfq, Supplier, SupplierProduct, SupplierVerificationRequest, Verification } from "@/lib/types";
import { productReadiness } from "@/lib/media/readiness";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { isTestOnlyProduct, productBelongsToCategory, productReviewApproved } from "@/lib/public/product-selection";

export interface MarketplaceSnapshot {
  publishedSuppliers: Supplier[];
  pendingSuppliers: Supplier[];
  pendingProducts: SupplierProduct[];
  publishedCategories: Category[];
  liveProducts: SupplierProduct[];
  categoriesWithOffers: number;
  submittedReviews: Verification[];
  contactRequests: SupplierVerificationRequest[];
  newRfqs: Rfq[];
}

/** Same public-listing gates as the catalogue. A ready checkbox alone is not a live offer. */
export function buildMarketplaceSnapshot(input: {
  suppliers: Supplier[];
  products: SupplierProduct[];
  categories: Category[];
  media: MediaAsset[];
  verifications?: Verification[];
  requests?: SupplierVerificationRequest[];
  rfqs?: Rfq[];
}): MarketplaceSnapshot {
  const suppliers = input.suppliers.filter((s) => !isSyntheticSupplier(s));
  const supplierIds = new Set(suppliers.map((s) => s.id));
  const publishedSuppliers = suppliers.filter((s) => s.status === "published");
  const publishedIds = new Set(publishedSuppliers.map((s) => s.id));
  const publishedCategories = input.categories.filter((c) => c.status === "published" && c.is_published);
  const assets = new Map<string, MediaAsset[]>();
  for (const m of input.media) {
    if (!m.product_id) continue;
    const group = assets.get(m.product_id) ?? [];
    group.push(m);
    assets.set(m.product_id, group);
  }
  const offeredCategories = new Set<string>();
  const liveProducts = input.products.filter((p) => {
    if (!publishedIds.has(p.supplier_id) || isTestOnlyProduct(p.name) || !p.ready_for_buyer ||
        !productReviewApproved(p) || !productReadiness(assets.get(p.id) ?? []).ready) return false;
    const category = publishedCategories.find((c) => productBelongsToCategory(p, c, input.categories));
    if (!category) return false;
    offeredCategories.add(category.id);
    return true;
  });
  const approvedChecks = new Set((input.verifications ?? []).filter((v) => v.status === "approved")
    .map((v) => `${v.supplier_id}:${v.target_level}`));
  return {
    publishedSuppliers,
    pendingSuppliers: suppliers.filter((s) => s.onboarding_status === "pending")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    pendingProducts: input.products.filter((p) => p.supplier_review_status === "pending" &&
      supplierIds.has(p.supplier_id) && !isTestOnlyProduct(p.name))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    publishedCategories,
    liveProducts,
    categoriesWithOffers: offeredCategories.size,
    submittedReviews: (input.verifications ?? []).filter((v) => v.status === "submitted" && supplierIds.has(v.supplier_id))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    contactRequests: (input.requests ?? []).filter((r) => r.status === "requested" && supplierIds.has(r.supplier_id) &&
      !approvedChecks.has(`${r.supplier_id}:${r.target_level}`))
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at)),
    newRfqs: (input.rfqs ?? []).filter((r) => r.status === "new" || r.status === "needs_review")
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}
