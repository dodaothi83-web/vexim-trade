import "server-only";

import { cache } from "react";

/**
 * Cờ theo từng request: trang sản phẩm đang render cho bản động dành cho người có phiên
 * (app/(public)/staff-product-view, xem lib/public/product-route.ts) hay bản tĩnh cho khách.
 *
 * Bản tĩnh tuyệt đối không được đọc cookie/phiên (đọc là Next.js buộc render động, mất cache
 * CDN), nên trang chỉ gọi getSession() khi cờ này bật. React cache() giữ một object riêng cho
 * mỗi request và dùng chung giữa generateMetadata với trang, nên route nội bộ chỉ cần bật cờ
 * trước khi gọi lại đúng component của app/(public)/products/[slug]/[productId]/page.tsx.
 */
const viewState = cache(() => ({ staff: false }));

export function enableStaffProductView(): void {
  viewState().staff = true;
}

export function isStaffProductView(): boolean {
  return viewState().staff;
}
