/* Buyer-facing presentation order. Keep every offer distinct; never merge equal grades. */
export function arrangeSupplierProducts<T extends { supplierId: string }>(
  products: T[],
  perSupplier: number | null,
): { shown: T[]; hidden: Map<string, number> } {
  const groups = new Map<string, T[]>();
  const hidden = new Map<string, number>();
  for (const product of products) {
    const group = groups.get(product.supplierId) ?? [];
    if (!groups.has(product.supplierId)) groups.set(product.supplierId, group);
    if (perSupplier === null || group.length < perSupplier) group.push(product);
    else hidden.set(product.supplierId, (hidden.get(product.supplierId) ?? 0) + 1);
  }

  const shown: T[] = [];
  const ids = [...groups.keys()]; // tie-break by original verification/name ranking
  let last = "";
  let streak = 0;
  let remaining = products.length - [...hidden.values()].reduce((sum, count) => sum + count, 0);
  while (remaining > 0) {
    const available = ids.filter((id) => groups.get(id)!.length > 0);
    // Preserve alternatives for later when one supplier has many more offers.
    const eligible = available.filter((id) => id !== last || streak < 2);
    const choices = eligible.length ? eligible : available;
    const chosen = choices.reduce((best, id) => groups.get(id)!.length > groups.get(best)!.length ? id : best);
    shown.push(groups.get(chosen)!.shift()!);
    streak = chosen === last ? streak + 1 : 1;
    last = chosen;
    remaining--;
  }
  // If only one supplier still has offers, a third consecutive card is unavoidable
  // without hiding a filtered result or inventing another company's offer.
  return { shown, hidden };
}

/** Giới hạn số sản phẩm mỗi nhà cung cấp trên lưới trang chủ. */
export const HOME_FEED_PER_SUPPLIER = 2;

/**
 * Số thẻ mỗi trang của lưới sản phẩm trang chủ, tính theo số cột đang hiển thị.
 *
 * Lưới chia hai cột ở điện thoại, ba cột từ 768px và năm cột từ 1024px:
 *
 *   dưới 768px   2 cột   6 thẻ  →  ba hàng
 *   768–1023px   3 cột   6 thẻ  →  hai hàng
 *   từ 1024px    5 cột  15 thẻ  →  ba hàng
 *
 * Trang cuối giữ phần còn lại; không cắt hoặc lặp sản phẩm để lấp đủ hàng.
 */
export const HOME_FEED_PER_PAGE = 6;

/** 15 thẻ mỗi trang trên lưới năm cột ở desktop. */
export const HOME_FEED_PER_PAGE_WIDE = 15;

/** Mốc năm cột, phải khớp với `lg:` của lưới trong components/home-product-feed.tsx. */
export const HOME_FEED_WIDE_QUERY = "(min-width: 1024px)";

/**
 * Số thẻ mỗi trang theo bề rộng màn hình.
 *
 * Tách thành hàm thuần để kiểm được bằng số, không cần trình duyệt.
 */
export function feedPerPage(wide: boolean): number {
  return wide ? HOME_FEED_PER_PAGE_WIDE : HOME_FEED_PER_PAGE;
}
