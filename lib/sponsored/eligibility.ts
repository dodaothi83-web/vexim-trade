import "server-only";

import { listPublicCategoryProducts, loadPublicProductCatalogSnapshot } from "@/lib/public/product-catalog";
import type { SponsoredPush } from "@/lib/types";
import { getStore } from "@/lib/db";
import { withoutDirectContacts } from "@/lib/public/product-selection";

/**
 * Sản phẩm được phép đẩy.
 *
 * Danh sách này lấy từ chính hàm dựng danh mục công khai, nên điều kiện trùng khớp
 * với thứ buyer nhìn thấy: hồ sơ nhà cung cấp đã publish, sản phẩm đã duyệt, sẵn
 * sàng gửi buyer kèm ảnh hoặc catalogue, danh mục đã mở, và không phải hồ sơ demo.
 *
 * Kiểm lại ở máy chủ trong lúc tạo gói, không tin danh sách gửi từ trình duyệt:
 * trả tiền không mua được quyền vượt bốn cổng đó.
 */
export interface PushCandidate {
  productId: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  supplierId: string;
  supplierName: string;
  imagePath: string | null;
}

export async function eligiblePushProducts(): Promise<PushCandidate[]> {
  const store = getStore();
  const categories = (await store.listCategories({ publishedOnly: true })).filter((c) => c.status === "published");
  const byProduct = new Map<string, PushCandidate>();
  const snapshot = categories.length ? await loadPublicProductCatalogSnapshot() : null;
  for (const category of categories) {
    const products = await listPublicCategoryProducts(category, snapshot ? { snapshot } : undefined);
    for (const product of products) {
      if (product.isDemo || byProduct.has(product.id)) continue;
      byProduct.set(product.id, {
        productId: product.id,
        name: withoutDirectContacts(product.name),
        categorySlug: category.slug,
        categoryName: category.name_i18n?.en ?? category.slug,
        supplierId: product.supplierId,
        supplierName: withoutDirectContacts(product.supplierName),
        imagePath: product.cardImagePath,
      });
    }
  }
  return [...byProduct.values()].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName) || a.name.localeCompare(b.name));
}

/** Recheck the package's actual category and supplier, not just the first category
 * in the create form. A product may legitimately belong to both a parent and child. */
export async function isPushProductEligible(push: Pick<SponsoredPush, "product_id" | "supplier_id" | "category_slug">): Promise<boolean> {
  const categories = await getStore().listCategories({ publishedOnly: true });
  const category = categories.find((c) => c.slug === push.category_slug && c.status === "published");
  if (!category) return false;
  const products = await listPublicCategoryProducts(category);
  return products.some((p) => !p.isDemo && p.id === push.product_id && p.supplierId === push.supplier_id);
}
