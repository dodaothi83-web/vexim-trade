import { publicProductCategorySlug } from "@/lib/public/product-selection";
import type { Category, SupplierProduct } from "@/lib/types";

/**
 * Resolve an old category URL only after the caller verifies that the target
 * category and product are publicly eligible. This keeps indexed links working
 * after a category move without disclosing private or unpublished listings.
 */
export async function movedProductDestination(product: SupplierProduct, categories: Category[], requestedSlug: string,
  isPublicTarget: (slug: string) => Promise<boolean>): Promise<string | null> {
  const published = categories.filter((category) => category.status === "published" && category.is_published);
  const slug = publicProductCategorySlug(product, published);
  if (!slug || slug === requestedSlug || !published.some((category) => category.slug === slug) || !await isPublicTarget(slug)) return null;
  return `/products/${encodeURIComponent(slug)}/${encodeURIComponent(product.id)}`;
}
