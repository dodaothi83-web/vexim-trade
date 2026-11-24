/**
 * Giới hạn ảnh tải lên cho bài viết (ảnh bìa, khối ảnh, ảnh dán/kéo thả vào trình soạn thảo).
 * Dùng chung cho trình duyệt và /api/upload-image để thông báo luôn giống nhau.
 *
 * Ảnh vẫn được nén sang WebP ≤1600px khi lưu (lib/media/blog-image.ts); giới hạn này chặn từ
 * đầu ảnh quá nặng để người viết chủ động dùng ảnh vừa phải.
 */
export const BLOG_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const BLOG_IMAGE_MAX_LABEL = "2 MB";
export const BLOG_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const BLOG_IMAGE_TYPES = BLOG_IMAGE_ACCEPT.split(",");
export const BLOG_IMAGE_HINT = `JPG, PNG hoặc WebP, tối đa ${BLOG_IMAGE_MAX_LABEL}, nên rộng 1200 đến 1600px`;

function megabytes(bytes: number): string {
  return (Math.ceil((bytes / (1024 * 1024)) * 10) / 10).toFixed(1).replace(".", ",");
}

export function blogImageTooLargeMessage(bytes: number): string {
  return `Ảnh nặng ${megabytes(bytes)} MB, vượt giới hạn ${BLOG_IMAGE_MAX_LABEL}. Hãy thu nhỏ ảnh còn rộng tối đa 1600px rồi tải lại.`;
}

/** Lý do không nhận ảnh, hoặc null nếu ảnh hợp lệ (kiểm tra ở trình duyệt trước khi gửi). */
export function blogImageProblem(file: { type: string; size: number }): string | null {
  if (!BLOG_IMAGE_TYPES.includes(file.type)) return "Chỉ nhận ảnh JPG, PNG hoặc WebP.";
  if (file.size > BLOG_IMAGE_MAX_BYTES) return blogImageTooLargeMessage(file.size);
  return null;
}
