import "server-only";

import { randomBytes } from "node:crypto";

import sharp from "sharp";

import { getStore } from "@/lib/db";
import { isExpired } from "@/lib/media/readiness";
import { getObject } from "@/lib/media/storage";
import { r2Delete, r2Put, r2PublicBucket } from "@/lib/media/r2";
import { CDN_IMAGE_SIZES, CDN_KEY_BASE, cdnImagePath, type CdnImageSize } from "@/lib/media/public-url";
import type { MediaAsset } from "@/lib/types";

/**
 * Bản sao CDN của ảnh sản phẩm và ảnh nhà máy công khai (chủ dự án duyệt 24/11/2026).
 *
 *  - Ảnh nằm ở bucket R2 công khai `veximtrade-media` (https://media.veximtrade.com), khoá
 *    `p/<productId>/<32 hex ngẫu nhiên>/<400|1024|1600>.webp` (ảnh nhà máy: `s/<supplierId>/…`).
 *    Cache `public, max-age=31536000, immutable`: tệp không bao giờ bị ghi đè, đổi ảnh là khoá mới.
 *  - Trang công khai đọc thẳng từ CDN, không qua /public-media và không qua trình tối ưu ảnh
 *    Next.js: 400 cho thẻ/danh sách, 1024 cho trang chi tiết, 1600 cho xem phóng to.
 *  - Đổi lại: ai có link vẫn mở được ảnh, kể cả khi sản phẩm bị ẩn. Khoá có 128 bit ngẫu
 *    nhiên nên không đoán được, và trang không còn hiện link đó. Gỡ ảnh (xoá, chuyển sang nội bộ,
 *    hết hạn) thì xoá tệp trên R2; bản đã nằm trong cache CDN/trình duyệt hết hạn tự nhiên
 *    (chưa có token purge cache Cloudflare).
 *  - Không bao giờ chép: giấy tờ, chứng nhận, ảnh nội bộ, ảnh đợt kiểm/hồ sơ NCC gửi, tệp chat,
 *    ảnh A+ và sản phẩm thử nghiệm ed3a38eb.
 *
 * Bật bằng MEDIA_CDN_ENABLED=true (cần R2_BUCKET_NAME + R2_PUBLIC_URL). Tắt biến này là trang
 * quay về storage_path/thumb_path qua /public-media ngay, vì bản gốc không bị đổi.
 */

export const CDN_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Sản phẩm thử nghiệm của chủ dự án: không chép ảnh lên CDN. */
const EXCLUDED_PRODUCT_PREFIXES = ["ed3a38eb"];

const OWNER_ID = /^[A-Za-z0-9_-]+$/;

export function mediaCdnEnabled(): boolean {
  return process.env.MEDIA_CDN_ENABLED === "true" && !!r2PublicBucket();
}

export type CdnOwner = { prefix: "p" | "s"; ownerId: string };

/**
 * Ảnh này có được chép lên CDN không (chỉ xét bản thân tệp). Trang công khai vẫn tự kiểm tra
 * sản phẩm/nhà cung cấp đã đăng trước khi hiện ảnh; bản chép chỉ thay chỗ đọc ảnh.
 */
export function cdnOwnerOf(asset: Pick<MediaAsset, "owner_type" | "product_id" | "supplier_id" | "kind" | "audience" | "storage_path" | "expires_on" | "status">): CdnOwner | null {
  if (asset.kind !== "image" || asset.audience !== "buyer" || !asset.storage_path || isExpired(asset)) return null;
  const path = asset.storage_path;
  if (asset.owner_type === "product" && asset.product_id && OWNER_ID.test(asset.product_id)) {
    if (EXCLUDED_PRODUCT_PREFIXES.some((prefix) => asset.product_id!.startsWith(prefix))) return null;
    if (!path.startsWith("products/") && !path.startsWith("product-form-images/")) return null;
    return { prefix: "p", ownerId: asset.product_id };
  }
  if (asset.owner_type === "supplier" && asset.supplier_id && OWNER_ID.test(asset.supplier_id)) {
    // Chỉ ảnh nhà máy đã chia sẻ với người mua trong thư mục của chính nhà cung cấp; không lấy
    // kho ảnh `supplier-media/` (nội bộ) hay ảnh đại diện/bìa/khối nội dung (lưu ở bảng suppliers).
    const file = path.split("/").at(-1) ?? "";
    if (!path.startsWith(`suppliers/${asset.supplier_id}/`) || /^(?:profile|cover|showcase)-/i.test(file)) return null;
    return { prefix: "s", ownerId: asset.supplier_id };
  }
  return null;
}

/** Ba bản WebP 400 / 1024 / 1600. Bản 1600 dùng lại nguyên tệp nếu nó đã là WebP ≤1600px. */
export async function makeCdnVariants(bytes: Uint8Array): Promise<Record<CdnImageSize, Uint8Array>> {
  const input = () => sharp(bytes, { limitInputPixels: 25_000_000, failOn: "error" });
  const meta = await input().metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  const reuse = meta.format === "webp" && longest > 0 && longest <= 1600 && (!meta.orientation || meta.orientation === 1);
  const encode = async (size: CdnImageSize) => new Uint8Array(await input()
    .rotate()
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .webp({ quality: size === 400 ? 72 : 78, effort: 4 })
    .toBuffer());
  const [small, medium, large] = await Promise.all([encode(400), encode(1024), reuse ? Promise.resolve(bytes) : encode(1600)]);
  return { 400: small, 1024: medium, 1600: large };
}

async function deleteCdnObjects(base: string): Promise<void> {
  const bucket = r2PublicBucket();
  if (!bucket || !CDN_KEY_BASE.test(base)) return;
  await Promise.all(CDN_IMAGE_SIZES.map((size) => r2Delete(bucket, cdnImagePath(base, size))));
}

/**
 * Chép một ảnh lên CDN và ghi gốc khoá vào media_assets.cdn_key. `source` là byte ảnh đã có sẵn
 * (lúc tải lên); không có thì đọc bản gốc từ kho. Ghi DB lỗi thì xoá tệp vừa chép.
 */
export async function publishMediaToCdn(asset: MediaAsset, source?: Uint8Array): Promise<MediaAsset> {
  const bucket = r2PublicBucket();
  const owner = cdnOwnerOf(asset);
  if (!bucket) throw new Error("Chưa cấu hình bucket R2 công khai.");
  if (!owner) throw new Error("Ảnh này không được chép lên CDN.");
  const bytes = source ?? (await getObject(asset.storage_path!))?.data;
  if (!bytes) throw new Error(`Không đọc được ảnh gốc ${asset.storage_path}`);
  const variants = await makeCdnVariants(bytes);
  const base = `${owner.prefix}/${owner.ownerId}/${randomBytes(16).toString("hex")}`;
  try {
    await Promise.all(CDN_IMAGE_SIZES.map((size) =>
      r2Put(bucket, cdnImagePath(base, size), variants[size], "image/webp", CDN_CACHE_CONTROL)));
    const updated = await getStore().updateMedia(asset.id, { cdn_key: base });
    if (asset.cdn_key && asset.cdn_key !== base) await deleteCdnObjects(asset.cdn_key).catch(() => null);
    return updated;
  } catch (error) {
    await deleteCdnObjects(base).catch(() => null);
    throw error;
  }
}

/** Xoá bản CDN của một ảnh (đã xoá dòng thì chỉ xoá tệp). */
export async function removeMediaFromCdn(asset: Pick<MediaAsset, "id" | "cdn_key">, options?: { rowDeleted?: boolean }): Promise<void> {
  if (!asset.cdn_key) return;
  await deleteCdnObjects(asset.cdn_key);
  if (!options?.rowDeleted) await getStore().updateMedia(asset.id, { cdn_key: null });
}

/**
 * Đồng bộ bản CDN sau khi tạo/sửa một ảnh: ảnh công khai chưa có bản chép thì chép; ảnh không
 * còn công khai (nội bộ, hết hạn) thì xoá bản chép. Không bao giờ làm hỏng thao tác chính:
 * lỗi chỉ được ghi log, trang vẫn dùng ảnh gốc qua /public-media.
 */
export async function syncMediaCdn(asset: MediaAsset | null | undefined, source?: Uint8Array): Promise<void> {
  if (!asset) return;
  try {
    if (cdnOwnerOf(asset)) {
      if (mediaCdnEnabled() && !asset.cdn_key) await publishMediaToCdn(asset, source);
    } else if (asset.cdn_key && r2PublicBucket()) {
      // Gỡ bản chép kể cả khi đã tắt MEDIA_CDN_ENABLED: link CDN cũ không được mở mãi.
      await removeMediaFromCdn(asset);
    }
  } catch (error) {
    console.error("[media-cdn] sync failed", asset.id, error);
  }
}

/** Sau khi xoá dòng media: xoá luôn bản CDN. Bucket chưa cấu hình thì bỏ qua. */
export async function removeDeletedMediaFromCdn(asset: Pick<MediaAsset, "id" | "cdn_key"> | null | undefined): Promise<void> {
  if (!asset?.cdn_key || !r2PublicBucket()) return;
  try {
    await removeMediaFromCdn(asset, { rowDeleted: true });
  } catch (error) {
    console.error("[media-cdn] delete failed", asset.id, error);
  }
}
