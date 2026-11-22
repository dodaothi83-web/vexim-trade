import "server-only";

import { cache } from "react";

/**
 * Cờ theo từng request: trang danh mục đang render cho bản dựng sẵn (ISR) dành cho khách
 * (app/(public)/products/category-render, xem lib/public/category-route.ts) hay bản động.
 *
 * Bản dựng sẵn tuyệt đối không được đọc cookie/phiên (đọc là Next.js buộc render động, mất cache
 * CDN), nên trang chỉ gọi getSession() khi cờ này TẮT. React cache() giữ một object riêng cho mỗi
 * request và dùng chung giữa generateMetadata với trang, nên route nội bộ chỉ cần bật cờ trước khi
 * gọi lại đúng component của app/(public)/products/[slug]/page.tsx.
 */
const renderState = cache(() => ({ prebuilt: false }));

export function enablePrebuiltCategoryRender(): void {
  renderState().prebuilt = true;
}

export function isPrebuiltCategoryRender(): boolean {
  return renderState().prebuilt;
}
