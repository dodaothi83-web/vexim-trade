"use client";

// Leave ample room for multipart encoding under both Next's 4 MB server-action
// limit and common 4.5 MB serverless request limits. The server revalidates and
// prepares every file; this browser helper is not a security boundary.
export const PRODUCT_FORM_TRANSPORT_BYTES = 2_500_000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 25_000_000;

/** Reduce a large image for upload while keeping the original file untouched. */
export async function prepareProductFormImageTransport(file: File): Promise<File> {
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_SOURCE_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Chọn ảnh JPG, PNG hoặc WebP, tối đa 8 MB mỗi ảnh.");
  if (file.size <= PRODUCT_FORM_TRANSPORT_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined")
    throw new Error("Trình duyệt chưa hỗ trợ giảm dung lượng ảnh. Hãy chọn ảnh nhỏ hơn.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("Không đọc được ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP."); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS)
      throw new Error("Kích thước ảnh quá lớn. Hãy chọn ảnh khác.");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không xử lý được ảnh trên trình duyệt này.");
    for (const edge of [1600, 1280, 960, 640]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.70, 0.55]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        if (!blob || blob.type !== "image/webp") throw new Error("Trình duyệt chưa hỗ trợ xử lý ảnh WebP. Hãy chọn ảnh nhỏ hơn.");
        if (blob.size > 0 && blob.size <= PRODUCT_FORM_TRANSPORT_BYTES) {
          const stem = file.name.replace(/\.[^.]*$/, "").slice(0, 140) || "anh-san-pham";
          return new File([blob], `${stem}.webp`, { type: "image/webp", lastModified: file.lastModified });
        }
      }
    }
    throw new Error("Không giảm được ảnh đủ nhỏ để tải. Hãy chọn ảnh khác.");
  } finally { bitmap.close(); }
}
