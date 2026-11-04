import type { HomeFeedProduct } from "@/components/home-product-feed";

/** Category relevance, not an inferred preference profile or a claim of equivalent specifications. */
export function buyerRecommendations(items: HomeFeedProduct[], savedIds: readonly string[], categorySlugs: readonly string[], limit = 10) {
  const saved = new Set(savedIds);
  const categories = new Set(categorySlugs);
  const seen = new Set<string>();
  return items.filter((item) => {
    if (saved.has(item.id) || seen.has(item.id) || item.isDemo || item.isDemoSupplier) return false;
    if (categories.size && !categories.has(item.categorySlug)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, limit);
}
