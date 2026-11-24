import "server-only";

import sharp from "sharp";

/**
 * Ảnh bài viết (ảnh bìa và ảnh trong nội dung) luôn lưu ở dạng WebP, cạnh dài tối đa 1600px.
 *
 * Trước đây ảnh được lưu nguyên tệp gốc: nhiều ảnh PNG 1–2,5 MB làm một bài nặng tới 11 MB.
 * Cùng ảnh đó sau khi chuyển chỉ còn khoảng 100–300 KB, nhìn không khác trên màn hình.
 *  - GIF giữ nguyên (có thể là ảnh động).
 *  - Ảnh đã là WebP mà bản chuyển không nhỏ hơn thì giữ bản gốc.
 */
export const BLOG_IMAGE_MAX_SIDE = 1600;
const BLOG_IMAGE_QUALITY = 80;

export type BlogImage = { data: Uint8Array; mime: string; ext: string };

export async function optimizeBlogImage(bytes: Uint8Array, mime: string): Promise<BlogImage> {
  if (mime === "image/gif") return { data: bytes, mime, ext: "gif" };
  const output = new Uint8Array(await sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" })
    .rotate()
    .resize({ width: BLOG_IMAGE_MAX_SIDE, height: BLOG_IMAGE_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: BLOG_IMAGE_QUALITY, effort: 4 })
    .toBuffer());
  if (mime === "image/webp" && output.byteLength >= bytes.byteLength) return { data: bytes, mime, ext: "webp" };
  return { data: output, mime: "image/webp", ext: "webp" };
}
