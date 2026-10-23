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

/**
 * Số sản phẩm tối thiểu để lưới sản phẩm được đứng trên lưới danh mục.
 *
 * Tám là hai hàng đầy trên lưới bốn cột ở màn rộng, và bốn hàng ở màn điện thoại.
 * Dưới ngưỡng đó, mở trang bằng một dải thẻ thưa sẽ nói với buyer rằng sàn chưa
 * có hàng, đúng ở vị trí đắt nhất của trang.
 *
 * Con số này không phải sở thích. Với giới hạn hai sản phẩm mỗi nhà cung cấp,
 * tám sản phẩm chỉ đạt được khi có ít nhất bốn nhà cung cấp, nên nó tự động bảo
 * đảm lưới không phải catalogue của một công ty.
 */
export const HOME_FEED_PRODUCTS = 8;

/** Số nhà cung cấp tối thiểu, chốt lại lần nữa để đổi giới hạn trên không phá bảo đảm. */
export const HOME_FEED_SUPPLIERS = 3;

/** Giới hạn số sản phẩm mỗi nhà cung cấp trên lưới trang chủ. */
export const HOME_FEED_PER_SUPPLIER = 2;

/**
 * Số thẻ mỗi trang của lưới sản phẩm trang chủ.
 *
 * Sáu là số chia hết cho cả hai, ba và bốn cột ở mọi cỡ màn hình, nên mỗi trang
 * xếp thành hàng đầy, không có thẻ lẻ ở cuối hàng. Đổi số này thì số trang đổi
 * theo, không phải sửa chỗ nào khác.
 */
export const HOME_FEED_PER_PAGE = 6;

/**
 * Có đủ hàng để đưa lưới sản phẩm lên trên lưới danh mục hay không.
 *
 * Xét trên danh sách đã áp giới hạn mỗi nhà cung cấp, vì đó mới là thứ buyer
 * thật sự nhìn thấy. Xét trên danh sách thô sẽ cho qua những trường hợp hàng
 * trăm sản phẩm của hai nhà cung cấp mà lưới chỉ hiện được bốn thẻ.
 */
export function shouldPromoteProductFeed(
  shown: ReadonlyArray<{ supplierId: string }>,
): { promoted: boolean; products: number; suppliers: number } {
  const suppliers = new Set(shown.map((p) => p.supplierId)).size;
  const products = shown.length;
  return {
    promoted: products >= HOME_FEED_PRODUCTS && suppliers >= HOME_FEED_SUPPLIERS,
    products,
    suppliers,
  };
}
