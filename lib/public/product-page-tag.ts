import "server-only";

import { unstable_cache } from "next/cache";

/**
 * Thẻ riêng của một trang chi tiết sản phẩm. Gắn vào trang ISR (kể cả đường dẫn danh mục cũ của
 * cùng sản phẩm), để khi sửa sản phẩm chỉ trang đó phải dựng lại ngay, thay vì mọi trang sản phẩm.
 */
export function productPageTag(productId: string): string {
  return `product-page:${productId}`;
}

/**
 * Next.js gom thẻ của mọi unstable_cache mà trang đọc trong lúc dựng thành thẻ của chính trang.
 * Mục cache này không chứa dữ liệu gì (luôn là true, không bao giờ hết hạn theo giờ nên không
 * rút ngắn thời gian làm mới 1 giờ của trang); nó chỉ để trang mang thẻ productPageTag(id).
 * Chỉ gọi với id sản phẩm đã kiểm tra là có thật.
 */
export async function tagProductPage(productId: string): Promise<void> {
  await unstable_cache(async () => true, ["product-page-tag", productId], {
    revalidate: false,
    tags: [productPageTag(productId)],
  })();
}
