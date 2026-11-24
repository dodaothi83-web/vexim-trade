import { CDN_KEY_BASE, cdnImagePath } from "@/lib/media/public-url";
import type { MediaAsset } from "@/lib/types";

/**
 * Đường dẫn ảnh đưa vào trang công khai cho một dòng media_assets.
 *
 * MEDIA_CDN_ENABLED=true và ảnh đã có bản chép CDN (cdn_key): trả bản 400px cho thẻ/danh sách
 * hoặc 1024px cho trang chi tiết; publicMediaUrl() đổi đường dẫn đó thành link CDN trực tiếp.
 * Ngược lại trả đúng đường dẫn cũ (thumb_path/storage_path), đi qua /public-media như trước.
 * Không phải server-only để script kiểm tra nạp được; biến môi trường chỉ có ở máy chủ.
 */
export function mediaCdnReadEnabled(): boolean {
  return process.env.MEDIA_CDN_ENABLED === "true";
}

export function publicImagePath(
  asset: Pick<MediaAsset, "storage_path" | "thumb_path"> & { cdn_key?: string | null },
  use: "card" | "detail",
): string | null {
  if (mediaCdnReadEnabled() && asset.cdn_key && CDN_KEY_BASE.test(asset.cdn_key)) {
    return cdnImagePath(asset.cdn_key, use === "card" ? 400 : 1024);
  }
  return use === "card" ? (asset.thumb_path || asset.storage_path) : asset.storage_path;
}
