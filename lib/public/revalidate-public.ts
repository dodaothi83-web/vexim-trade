import "server-only";

import { revalidateTag } from "next/cache";

import { productPageTag } from "@/lib/public/product-page-tag";
import { warmProductPageAfterResponse } from "@/lib/public/warm-product-page";

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

/**
 * Sau khi nhà cung cấp hoặc nhân viên sửa MỘT sản phẩm (nội dung, ảnh, giá, A+, duyệt).
 *
 * - Trang của chính sản phẩm đó (mọi đường dẫn danh mục của nó): `expire: 0`, lượt xem kế tiếp
 *   chờ dữ liệu mới, không ai thấy bản cũ.
 * - Bản cache catalog và các trang khác đọc nó (trang chủ, danh mục, sản phẩm khác, nhà cung
 *   cấp): `"max"`, tức lượt xem kế tiếp vẫn nhận ngay bản đang có rồi trang tự dựng lại ở nền.
 *   Next.js chờ dữ liệu catalog mới trước khi lưu bản dựng lại, nên bản lưu không bao giờ cũ.
 *
 * - Sau khi phản hồi đã gửi, máy chủ tự mở lại trang sản phẩm đó một lần (warm-product-page.ts),
 *   để người mua đầu tiên không phải chờ dựng trang.
 *
 * Trước đây mỗi lần sửa xoá ngay mọi trang sản phẩm (revalidatePath("/products", "layout") và
 * revalidatePublicCatalog()), nên người mua phải chờ dựng lại ở hầu hết trang họ mở sau đó.
 */
export function revalidateProductEdit(productId: string): void {
  revalidateTag(productPageTag(productId), { expire: 0 });
  revalidateTag(PUBLIC_CATALOG_TAG, "max");
  warmProductPageAfterResponse(productId);
}
