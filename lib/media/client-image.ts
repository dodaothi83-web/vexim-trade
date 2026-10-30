"use client";

import { IMAGE_MAX_SIDE, THUMB_MAX_SIDE } from "@/lib/media/limits";

/**
 * Nén ảnh và tạo ảnh xem trước NGAY TRÊN TRÌNH DUYỆT trước khi tải lên:
 *  - giữ tỷ lệ, cạnh dài tối đa 1600px
 *  - xuất JPEG chất lượng 0.85 (ảnh có nền trong suốt vẫn ra nền trắng)
 *  - kèm một ảnh nhỏ 400px để hiển thị trong danh sách
 *
 * Nhờ vậy tệp tải lên nhẹ, không cần cài thư viện xử lý ảnh ở server.
 */

export interface PreparedImage {
  main: Blob;
  thumb: Blob;
  width: number;
  height: number;
  originalBytes: number;
}

async function loadBitmap(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, draw: bitmap };
    } catch {
      /* trình duyệt cũ: rơi xuống dùng thẻ <img> */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Không đọc được ảnh"));
      el.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight, draw: img };
  } finally {
    // Thu hồi sau khi vẽ xong (được gọi ở resize() bên dưới)
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function scaledSize(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const ratio = maxSide / longest;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

async function render(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  quality: number,
): Promise<Blob> {
  const size = scaledSize(width, height, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ canvas");
  // Ảnh PNG trong suốt: tô nền trắng trước khi nén sang JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(source, 0, 0, size.width, size.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  if (!blob) throw new Error("Không nén được ảnh");
  return blob;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const { width, height, draw } = await loadBitmap(file);
  const [main, thumb] = await Promise.all([
    render(draw, width, height, IMAGE_MAX_SIDE, 0.85),
    render(draw, width, height, THUMB_MAX_SIDE, 0.72),
  ]);
  const final = scaledSize(width, height, IMAGE_MAX_SIDE);
  return {
    main,
    thumb,
    width: final.width,
    height: final.height,
    originalBytes: file.size,
  };
}

/** Nhãn hiển thị trong ô chọn tệp — chỉ nhận ảnh và PDF */
export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf";
