/**
 * Đường dẫn hiển thị của một tệp media công khai (dùng được ở server và trình duyệt).
 *
 * - Ảnh đại diện/ảnh bìa mới (lưu ở bucket R2 công khai, tên tệp `profile-r2-…`/`cover-r2-…`)
 *   trả thẳng về tên miền R2, ví dụ https://media.veximtrade.com/suppliers/<id>/profile-r2-<uuid>.webp
 * - Ảnh sản phẩm và ảnh nhà máy công khai đã chép lên CDN (xem lib/media/cdn.ts) có dạng
 *   `p/<productId>/<32 hex>/<400|1024|1600>.webp` hoặc `s/<supplierId>/…`, cũng trả thẳng về R2.
 * - Mọi tệp khác (ảnh cũ ở Supabase chưa chép, ảnh A+…) vẫn đi qua /public-media để kiểm
 *   tra quyền như trước.
 *
 * NEXT_PUBLIC_R2_PUBLIC_URL được next.config.ts lấy từ R2_PUBLIC_URL lúc build. Chưa có thì
 * dùng /public-media; route đó vẫn đọc được tệp trên R2 nên ảnh không bao giờ bị vỡ.
 */

/** Tên tệp chỉ được tạo khi ảnh thật sự nằm ở bucket R2 công khai. */
export const R2_PUBLIC_FILE = /^suppliers\/[A-Za-z0-9_-]+\/(?:profile|cover)-r2-[a-f0-9-]{36}\.webp$/i;

/** Các cỡ ảnh CDN: 400 cho thẻ/danh sách, 1024 cho trang chi tiết, 1600 cho xem phóng to. */
export const CDN_IMAGE_SIZES = [400, 1024, 1600] as const;
export type CdnImageSize = (typeof CDN_IMAGE_SIZES)[number];

/** Gốc khoá CDN lưu ở media_assets.cdn_key: `p/<productId>/<32 hex>` hoặc `s/<supplierId>/<32 hex>`. */
export const CDN_KEY_BASE = /^[ps]\/[A-Za-z0-9_-]+\/[a-f0-9]{32}$/;
/** Một tệp ảnh trên CDN (gốc khoá + cỡ). */
export const CDN_IMAGE_FILE = /^[ps]\/[A-Za-z0-9_-]+\/[a-f0-9]{32}\/(?:400|1024|1600)\.webp$/;

export function isCdnImagePath(path: string | null | undefined): path is string {
  return !!path && CDN_IMAGE_FILE.test(path.replace(/^\/+/, ""));
}

/** Đường dẫn một cỡ ảnh từ gốc khoá CDN. */
export function cdnImagePath(base: string, size: CdnImageSize): string {
  return `${base}/${size}.webp`;
}

/** Đổi một tệp ảnh CDN sang cỡ khác; null nếu không phải ảnh CDN. */
export function cdnVariant(path: string, size: CdnImageSize): string | null {
  const clean = path.replace(/^\/+/, "");
  return CDN_IMAGE_FILE.test(clean) ? clean.replace(/\/(?:400|1024|1600)\.webp$/, `/${size}.webp`) : null;
}

export function r2PublicBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(base) ? base : "";
}

export function publicMediaUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const base = r2PublicBaseUrl();
  return base && (R2_PUBLIC_FILE.test(clean) || CDN_IMAGE_FILE.test(clean)) ? `${base}/${clean}` : `/public-media/${clean}`;
}

/** Link ảnh ở một cỡ CDN cụ thể; ảnh chưa chép lên CDN thì giữ nguyên tệp hiện có. */
export function publicMediaUrlAt(path: string, size: CdnImageSize): string {
  return publicMediaUrl(cdnVariant(path, size) ?? path);
}

/** srcset 400w/1024w/1600w cho ảnh CDN; null với ảnh chưa chép lên CDN. */
export function cdnImageSrcSet(path: string): string | null {
  if (!isCdnImagePath(path)) return null;
  return CDN_IMAGE_SIZES.map((size) => `${publicMediaUrl(cdnVariant(path, size)!)} ${size}w`).join(", ");
}

/** Đường dẫn tuyệt đối (thẻ Open Graph, JSON-LD, email). */
export function absolutePublicMediaUrl(path: string, siteUrl: string): string {
  const url = publicMediaUrl(path);
  return url.startsWith("/") ? `${siteUrl.replace(/\/+$/, "")}${url}` : url;
}
