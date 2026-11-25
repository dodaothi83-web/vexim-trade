import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import { productPageTag } from "@/lib/public/product-page-tag";
import { warmProductPageAfterResponse, warmProductPagesAfterResponse } from "@/lib/public/warm-product-page";

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

/** Tối đa bấy nhiêu trang sản phẩm được máy chủ tự mở lại sau một lần sửa tệp của nhà cung cấp. */
export const WARM_SUPPLIER_PRODUCT_PAGES = 20;

/**
 * Trang hồ sơ công khai của một nhà cung cấp. Chỉ trang này dựng lại ngay; trang con
 * /suppliers/<slug>/products/<id> render động nên không có bản cache nào phải xoá.
 */
export function revalidateSupplierPage(supplier: { id: string; slug?: string | null }): void {
  revalidatePath(`/suppliers/${supplier.slug || supplier.id}`);
}

/**
 * Sau khi nhân viên tải tệp chia sẻ người mua (ảnh gallery, chứng nhận…) lên hồ sơ MỘT nhà cung cấp.
 *
 * - Trang của nhà cung cấp đó và trang của các sản phẩm của họ (hiện chứng nhận/ảnh của nhà cung
 *   cấp): dựng lại ngay (`expire: 0`), rồi máy chủ tự mở lại tối đa WARM_SUPPLIER_PRODUCT_PAGES
 *   trang sản phẩm để người mua đầu tiên không phải chờ.
 * - Bản cache catalog (ảnh gallery nằm trên thẻ nhà cung cấp) và mọi trang khác đọc nó (trang chủ,
 *   danh mục, sản phẩm của nhà cung cấp khác): `"max"`, làm mới ở nền như revalidateProductEdit.
 *
 * Trước đây thao tác này gọi revalidatePath("/products", "layout") và revalidatePath("/suppliers",
 * "layout"): xoá ngay MỌI trang sản phẩm, danh mục và nhà cung cấp, nên sau mỗi lần tải ảnh người mua
 * phải chờ dựng lại ở gần như mọi trang họ mở.
 */
export function revalidateSupplierMediaEdit(supplier: { id: string; slug?: string | null }, productIds: readonly string[]): void {
  for (const id of productIds) revalidateTag(productPageTag(id), { expire: 0 });
  revalidateTag(PUBLIC_CATALOG_TAG, "max");
  revalidateSupplierPage(supplier);
  warmProductPagesAfterResponse(productIds.slice(0, WARM_SUPPLIER_PRODUCT_PAGES));
}
