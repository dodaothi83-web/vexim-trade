import "server-only";

import { revalidateTag } from "next/cache";

/** Thẻ của bản cache dữ liệu catalog dùng chung (unstable_cache trong lib/public/product-catalog.ts). */
export const PUBLIC_CATALOG_TAG = "public-catalog";

/**
 * Làm mới dữ liệu catalog công khai ngay sau khi nhà cung cấp hoặc nhân viên sửa.
 *
 * Trang công khai và bản cache catalog giữ 1 giờ (chủ dự án duyệt 24/11/2026). revalidatePath một
 * mình chỉ dựng lại trang, trang đó vẫn đọc bản cache catalog cũ, nên mọi thao tác đổi thứ người
 * mua thấy phải gọi thêm hàm này. `expire: 0`: lượt xem kế tiếp chờ dữ liệu mới, không thấy bản cũ.
 * Thẻ lan sang mọi trang ISR đã đọc bản cache này (trang chủ, danh mục, sản phẩm, nhà cung cấp).
 */
export function revalidatePublicCatalog(): void {
  revalidateTag(PUBLIC_CATALOG_TAG, { expire: 0 });
}
