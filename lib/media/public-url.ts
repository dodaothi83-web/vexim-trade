/**
 * Đường dẫn hiển thị của một tệp media công khai (dùng được ở server và trình duyệt).
 *
 * - Ảnh đại diện/ảnh bìa mới (lưu ở bucket R2 công khai, tên tệp `profile-r2-…`/`cover-r2-…`)
 *   trả thẳng về tên miền R2, ví dụ https://media.veximtrade.com/suppliers/<id>/profile-r2-<uuid>.webp
 * - Mọi tệp khác (ảnh cũ ở Supabase, ảnh sản phẩm, ảnh A+…) vẫn đi qua /public-media để kiểm
 *   tra quyền như trước.
 *
 * NEXT_PUBLIC_R2_PUBLIC_URL được next.config.ts lấy từ R2_PUBLIC_URL lúc build. Chưa có thì
 * dùng /public-media; route đó vẫn đọc được tệp trên R2 nên ảnh không bao giờ bị vỡ.
 */

/** Tên tệp chỉ được tạo khi ảnh thật sự nằm ở bucket R2 công khai. */
export const R2_PUBLIC_FILE = /^suppliers\/[A-Za-z0-9_-]+\/(?:profile|cover)-r2-[a-f0-9-]{36}\.webp$/i;

export function r2PublicBaseUrl(): string {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(base) ? base : "";
}

export function publicMediaUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const base = r2PublicBaseUrl();
  return base && R2_PUBLIC_FILE.test(clean) ? `${base}/${clean}` : `/public-media/${clean}`;
}

/** Đường dẫn tuyệt đối (thẻ Open Graph, JSON-LD). */
export function absolutePublicMediaUrl(path: string, siteUrl: string): string {
  const url = publicMediaUrl(path);
  return url.startsWith("/") ? `${siteUrl.replace(/\/+$/, "")}${url}` : url;
}
