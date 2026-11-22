/**
 * Trang chi tiết sản phẩm: bản tĩnh (ISR) cho khách và bản động cho người có phiên đăng nhập
 * nội bộ (nhân viên / nhà cung cấp) — hằng số dùng chung cho middleware.ts, route
 * app/(public)/staff-product-view và các component đọc pathname.
 *
 * Vì sao: /products/[slug]/[productId] từng là force-dynamic (đọc cookie ngôn ngữ + phiên),
 * nên mỗi lượt xem đều chờ máy chủ dựng lại trang và tra Supabase. Giờ trang được dựng một lần
 * rồi phục vụ từ CDN (làm mới mỗi phút và ngay khi CRM/cổng NCC gọi revalidatePath("/products",
 * "layout")). Người có cookie phiên hợp lệ được middleware viết lại (URL không đổi) sang
 * /staff-product-view/... — render động như trước: xem trước danh mục chưa công khai, không đếm
 * lượt xem của chính mình. Gõ thẳng /staff-product-view/... sẽ được chuyển về URL công khai.
 */
export const STAFF_PRODUCT_VIEW_PREFIX = "/staff-product-view";

const PUBLIC_PRODUCT_PATH = /^\/products\/([^/]+)\/([^/]+)\/?$/;
const STAFF_PRODUCT_PATH = /^\/staff-product-view\/([^/]+)\/([^/]+)\/?$/;

/** /products/<slug>/<id> → /staff-product-view/<slug>/<id>; null nếu không phải trang chi tiết. */
export function staffProductViewPath(pathname: string): string | null {
  const match = PUBLIC_PRODUCT_PATH.exec(pathname);
  return match ? `${STAFF_PRODUCT_VIEW_PREFIX}/${match[1]}/${match[2]}` : null;
}

/** URL công khai của route nội bộ /staff-product-view/...; null nếu không phải route đó. */
export function publicProductUrlFor(pathname: string): string | null {
  if (pathname !== STAFF_PRODUCT_VIEW_PREFIX && !pathname.startsWith(`${STAFF_PRODUCT_VIEW_PREFIX}/`)) return null;
  const match = STAFF_PRODUCT_PATH.exec(pathname);
  return match ? `/products/${match[1]}/${match[2]}` : "/products";
}
