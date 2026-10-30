import { pushIsLive, rankForWindow, rotationWindow } from "../sponsored/rotation";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";
import type { SponsoredPush, SponsoredPushSurface } from "@/lib/types";

/**
 * Một thẻ trong vùng đẩy: gói đã mua và sản phẩm công khai tương ứng.
 * Giữ cả hai để giao diện ghi nhận hiển thị theo `push.id`, không theo sản phẩm.
 */
export interface SponsoredBandItem {
  push: SponsoredPush;
  product: PublicCategoryProduct;
}

/**
 * Ghép gói đẩy với sản phẩm công khai.
 *
 * Hàm thuần: cùng đầu vào thì cùng đầu ra, không đọc đồng hồ, không đọc cơ sở dữ
 * liệu. Ba việc được làm ở đây, theo đúng thứ tự:
 *
 * 1. Bỏ gói hết hạn, gói chưa duyệt, gói sai bề mặt hoặc sai danh mục.
 * 2. Lấy thẻ theo thứ tự luân phiên của cửa sổ hiện tại, tối đa bằng số suất.
 * 3. Không trả về sản phẩm nào hai lần, kể cả khi dữ liệu cũ còn sót gói trùng.
 *
 * Gói trỏ tới sản phẩm không còn công khai (bị ẩn, hết hàng, đổi danh mục) thì
 * bị bỏ qua chứ không chiếm suất. Nhà cung cấp vẫn thấy gói trong CRM; chỉ là nó
 * không hiển thị được cho tới khi sản phẩm trở lại.
 */
export function pickSponsoredBand({
  pushes,
  products,
  slots,
  surface,
  categorySlug = null,
  nowMs,
}: {
  pushes: readonly SponsoredPush[];
  products: readonly PublicCategoryProduct[];
  slots: number;
  surface: SponsoredPushSurface;
  categorySlug?: string | null;
  nowMs: number;
}): SponsoredBandItem[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const eligible = pushes.filter((push) =>
    pushIsLive(push, nowMs) &&
    push.surface === surface &&
    (surface !== "category" || push.category_slug === categorySlug),
  );
  const band: SponsoredBandItem[] = [];
  const taken = new Set<string>();
  const limit = Math.max(0, slots);
  for (const push of rankForWindow(eligible, rotationWindow(nowMs))) {
    if (band.length >= limit) break;
    const product = byId.get(push.product_id);
    if (!product || taken.has(product.id)) continue;
    taken.add(product.id);
    band.push({ push, product });
  }
  return band;
}

/**
 * Bỏ khỏi lưới tự nhiên những sản phẩm đã lên vùng đẩy.
 *
 * Chỉ gọi khi vùng đẩy đang hiện. Lúc người xem bật bộ lọc thì vùng đẩy bị ẩn,
 * và khi đó sản phẩm trả phí phải quay lại lưới tự nhiên: nó vẫn là một sản phẩm
 * thật, ẩn nó đi chỉ vì gói không hiện được là làm mất hàng của nhà cung cấp.
 */
export function withoutSponsoredBand(
  products: readonly PublicCategoryProduct[],
  band: readonly SponsoredBandItem[],
): PublicCategoryProduct[] {
  if (band.length === 0) return [...products];
  const taken = new Set(band.map((item) => item.product.id));
  return products.filter((product) => !taken.has(product.id));
}
