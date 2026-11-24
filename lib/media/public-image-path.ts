import { CDN_KEY_BASE, cdnImagePath, type CdnImageSize } from "@/lib/media/public-url";
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

/* ------------------ Ảnh đại diện / ảnh bìa của nhà cung cấp ------------------ */

export type SupplierImageKind = "profile" | "cover";

/** Ảnh đại diện/bìa cũ ở Supabase: `suppliers/<id>/<profile|cover>-<uuid>.<jpg|png|webp>`. */
const LEGACY_SUPPLIER_IMAGE = /^suppliers\/([A-Za-z0-9_-]+)\/(profile|cover)-([a-f0-9]{8})-([a-f0-9]{4})-([a-f0-9]{4})-([a-f0-9]{4})-([a-f0-9]{12})\.(?:jpe?g|png|webp)$/i;

export type SupplierImageFields = {
  id: string;
  profile_image?: string | null;
  cover_image?: string | null;
  profile_image_cdn_key?: string | null;
  cover_image_cdn_key?: string | null;
};

/**
 * Gốc khoá CDN của một ảnh đại diện/bìa cũ: `s/<supplierId>/<uuid của tệp gốc, bỏ gạch>`.
 * Khoá suy ra từ chính tệp gốc, nên khi nhà cung cấp đổi ảnh thì khoá đã lưu không còn khớp và
 * trang tự quay về ảnh mới. Ảnh mới tải lên (`profile-r2-…`) đã nằm sẵn ở bucket công khai, không
 * cần bản chép; ảnh không đúng thư mục của chính nhà cung cấp thì không bao giờ được chép.
 */
export function supplierImageCdnBase(supplierId: string, path: string | null | undefined, kind: SupplierImageKind): string | null {
  const match = path ? LEGACY_SUPPLIER_IMAGE.exec(path.replace(/^\/+/, "")) : null;
  if (!match || match[1] !== supplierId || match[2].toLowerCase() !== kind) return null;
  const base = `s/${supplierId}/${match.slice(3, 8).join("").toLowerCase()}`;
  return CDN_KEY_BASE.test(base) ? base : null;
}

/**
 * Đường dẫn ảnh đại diện/bìa cho trang công khai. MEDIA_CDN_ENABLED=true và ảnh đã có bản chép
 * khớp với tệp hiện tại: trả bản CDN (400px cho ảnh đại diện, 1600px cho ảnh bìa, hoặc cỡ truyền
 * vào); ngược lại trả đúng đường dẫn cũ, đi qua /public-media như trước.
 */
export function publicSupplierImagePath(
  supplier: SupplierImageFields,
  kind: SupplierImageKind,
  size?: CdnImageSize,
): string | null {
  const path = (kind === "cover" ? supplier.cover_image : supplier.profile_image) ?? null;
  if (!path) return null;
  const stored = kind === "cover" ? supplier.cover_image_cdn_key : supplier.profile_image_cdn_key;
  if (mediaCdnReadEnabled() && stored && stored === supplierImageCdnBase(supplier.id, path, kind)) {
    return cdnImagePath(stored, size ?? (kind === "cover" ? 1600 : 400));
  }
  return path;
}
