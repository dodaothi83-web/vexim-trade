import { SITE_URL } from "@/lib/site";
import { publicMediaUrlAt } from "@/lib/media/public-url";

/**
 * Ảnh dùng cho máy tìm kiếm và hệ thống AI (og:image, JSON-LD, image sitemap).
 *
 * Chỉ trỏ tới ảnh đã đi qua cổng công khai (`/public-media/...` là ảnh
 * buyer-shareable) hoặc ảnh tĩnh trong `public/`. Không bao giờ lấy ảnh của
 * sản phẩm demo/nhà cung cấp mẫu.
 */

/** Ảnh dự phòng trung tính cho danh mục chưa có ảnh riêng (không phải ảnh hạt điều). */
export const CATEGORY_FALLBACK_IMAGE = "/images/hero-scene.jpg";

type ImageCarrier = {
  cardImagePath?: string | null;
  imagePaths?: string[] | null;
  isDemo?: boolean;
  isDemoSupplier?: boolean;
};

/** URL tuyệt đối cho một đường dẫn tương đối của site; giữ nguyên URL đã tuyệt đối. */
export function absoluteSiteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Đường dẫn công khai của một ảnh sản phẩm trong kho media. Ảnh đã chép lên CDN trả link CDN
 * tuyệt đối cỡ 1024px (thẻ 400px quá nhỏ cho og:image); ảnh khác đi qua /public-media.
 */
export function publicMediaPath(storagePath: string): string {
  return publicMediaUrlAt(storagePath.replace(/^\/+/, ""), 1024);
}

/** Ảnh đại diện (tuyệt đối) của một sản phẩm thật, hoặc null nếu không có/là dữ liệu mẫu. */
export function productImageUrl(product: ImageCarrier): string | null {
  if (product.isDemo || product.isDemoSupplier) return null;
  const path = product.cardImagePath || product.imagePaths?.find((p) => !!p?.trim());
  return path ? absoluteSiteUrl(publicMediaPath(path)) : null;
}

/**
 * Ảnh đại diện cho trang danh mục: ảnh hero do CMS chọn, nếu không có thì ảnh
 * sản phẩm thật đầu tiên trong danh mục, cuối cùng là ảnh trung tính của site.
 */
export function categoryShareImage(heroImage: string | null | undefined, products: ImageCarrier[]): string {
  const hero = heroImage?.trim();
  if (hero) return absoluteSiteUrl(hero);
  for (const product of products) {
    const url = productImageUrl(product);
    if (url) return url;
  }
  return absoluteSiteUrl(CATEGORY_FALLBACK_IMAGE);
}

/** Danh sách ảnh (tuyệt đối, không trùng) cho image sitemap; giới hạn số ảnh mỗi URL. */
export function sitemapImages(paths: Array<string | null | undefined>, limit = 10): string[] {
  const seen = new Set<string>();
  for (const path of paths) {
    const value = path?.trim();
    if (!value) continue;
    seen.add(absoluteSiteUrl(value));
    if (seen.size >= limit) break;
  }
  return [...seen];
}
