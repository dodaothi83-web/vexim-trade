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
  // First occurrence preserves the ranked supplier order; each round takes at most
  // one product per supplier, retaining the original order within each supplier.
  let active = [...groups.values()].filter((items) => items.length > 0).map((items) => ({ items, index: 0 }));
  while (active.length) {
    const next: typeof active = [];
    for (const group of active) {
      shown.push(group.items[group.index++]);
      if (group.index < group.items.length) next.push(group);
    }
    active = next;
  }
  // Once other suppliers are exhausted, remaining offers stay visible.
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

/**
 * Số thẻ mỗi trang của lưới trang danh mục.
 *
 * Lưới danh mục chia bốn cột từ 1024px, nên 12 thẻ là đúng ba hàng đầy trên
 * desktop; điện thoại một cột thì vẫn là mười hai thẻ, không cắt theo bề rộng để
 * số trang và URL không đổi khi người mua xoay máy hay đổi cỡ cửa sổ.
 */
export const CATEGORY_PAGE_SIZE = 12;

/** Số trang của một danh sách; danh sách rỗng vẫn là một trang. */
export function categoryPageCount(total: number, perPage: number = CATEGORY_PAGE_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 1;
  const size = Math.max(1, Math.floor(perPage));
  return Math.max(1, Math.ceil(total / size));
}

/**
 * Cắt một trang của danh sách. Trang ngoài phạm vi được kẹp về trang cuối thay vì
 * trả về danh sách rỗng, để `?page=99` không thành một trang trắng.
 */
export function categoryPageSlice<T>(
  items: readonly T[],
  page: number,
  perPage: number = CATEGORY_PAGE_SIZE,
): { items: T[]; page: number; pages: number; total: number } {
  const total = items.length;
  const pages = categoryPageCount(total, perPage);
  const size = Math.max(1, Math.floor(perPage));
  const wanted = Number.isFinite(page) ? Math.floor(page) : 1;
  const current = Math.min(Math.max(1, wanted), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages, total };
}

/** Homepage: give each category a turn before taking its next ranked offer.
 * Apply the supplier cap during selection, never regroup by supplier afterwards
 * (which would undo the category balance). Input category order breaks ties.
 */
export function balanceHomepageCategories<T extends { id: string; supplierId: string }>(
  groups: readonly (readonly T[])[],
  perSupplier: number = HOME_FEED_PER_SUPPLIER,
): T[] {
  const limit = Math.max(0, Math.floor(perSupplier));
  if (!limit) return [];
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const cursors = groups.map(() => 0);
  const result: T[] = [];
  let added: boolean;
  do {
    added = false;
    groups.forEach((products, groupIndex) => {
      while (cursors[groupIndex] < products.length) {
        const product = products[cursors[groupIndex]++];
        if (seen.has(product.id) || (counts.get(product.supplierId) ?? 0) >= limit) continue;
        seen.add(product.id);
        counts.set(product.supplierId, (counts.get(product.supplierId) ?? 0) + 1);
        result.push(product);
        added = true;
        break;
      }
    });
  } while (added);
  return result;
}

/**
 * Trang chủ luân phiên theo giờ (UTC). Trang danh mục KHÔNG dùng phần này: lưới tự
 * nhiên ở đó giữ thứ tự cố định theo docs/sponsored-listing-spec.md.
 *
 * - Thứ tự danh mục mở đầu và thứ tự sản phẩm CÙNG TẦNG xác minh đổi mỗi cửa sổ.
 * - Tầng xác minh vẫn cứng: sản phẩm 3/3 luôn đứng trên 2/3, trong mọi cửa sổ.
 * - Không dùng Math.random: cùng cửa sổ thì mọi người xem thấy cùng thứ tự, kiểm được.
 * - Thứ tự mỗi cửa sổ là băm (id + cửa sổ), không phải vòng tròn cố định, để một danh
 *   mục hay sản phẩm không bị khoá vào cùng khung giờ hay cùng thứ trong tuần.
 */
export const HOME_ROTATION_WINDOW_MINUTES = 60;

/** Mã cửa sổ luân phiên trang chủ tại thời điểm `nowMs`. */
export function homeRotationWindow(nowMs: number, windowMinutes: number = HOME_ROTATION_WINDOW_MINUTES): number {
  return Math.floor(nowMs / (Math.max(1, Math.trunc(windowMinutes)) * 60_000));
}

/** FNV-1a 32 bit rồi trộn thêm (fmix32) để các chuỗi chỉ khác đuôi vẫn tản đều. */
function rotationHash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

const rotationKey = (key: string, window: number) => rotationHash(`${key}:${window}`);

/** Xếp lại các mục (ví dụ danh mục) theo cửa sổ. Không đổi mảng đầu vào. */
export function rotateForWindow<T>(items: readonly T[], keyOf: (item: T) => string, window: number): T[] {
  return [...items].sort((a, b) => rotationKey(keyOf(a), window) - rotationKey(keyOf(b), window) ||
    (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
}

/** Giữ tầng xác minh, chỉ xáo thứ tự giữa các sản phẩm cùng tầng theo cửa sổ. */
export function rotateWithinVerificationTiers<T extends { id: string; verificationCount: number }>(
  products: readonly T[],
  window: number,
): T[] {
  return [...products].sort((a, b) => b.verificationCount - a.verificationCount ||
    rotationKey(a.id, window) - rotationKey(b.id, window) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
