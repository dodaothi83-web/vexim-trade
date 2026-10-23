import "server-only";

import { listPublicCategoryProducts } from "@/lib/public/product-catalog";
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
  const categories = await store.listCategories({ publishedOnly: true });
  const byProduct = new Map<string, PushCandidate>();
  for (const category of categories) {
    const products = await listPublicCategoryProducts(category);
    for (const product of products) {
      if (byProduct.has(product.id)) continue;
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
