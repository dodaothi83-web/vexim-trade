/**
 * Tải video lên Cloudflare Stream từ trình duyệt (dùng chung cho video sản phẩm và video A+).
 * Máy chủ Vexim chỉ xin đường tải lên một lần; tệp đi thẳng tới Cloudflare.
 */
import { APLUS_VIDEO_MAX_BYTES, VIDEO_LIMIT_SECONDS, type VideoKind } from "@/lib/products/aplus";

export type StreamUploadErrors = { video: string; videoTooLong: string; upload: string };

/** Kiểm tra trước khi tải: loại tệp, dung lượng, thời lượng. Trả câu báo lỗi hoặc null. */
export async function checkVideoFile(file: File, errors: StreamUploadErrors, fill: (text: string, values: Record<string, string | number>) => string, kind: VideoKind = "aplus"): Promise<string | null> {
  if (!/^video\//.test(file.type) || file.size > APLUS_VIDEO_MAX_BYTES) return errors.video;
  const seconds = await videoDuration(file);
  const limit = VIDEO_LIMIT_SECONDS[kind];
  if (seconds !== null && seconds > limit) return fill(errors.videoTooLong, { minutes: limit / 60 });
  return null;
}

/**
 * Nơi tải ảnh, video A+ của một sản phẩm. Sản phẩm mới chưa lưu (productId null) tải vào khu chờ,
 * được gắn vào sản phẩm khi lưu.
 */
export function aplusUploadEndpoint(productId: string | null): string {
  return productId ? `/api/supplier-portal/products/${encodeURIComponent(productId)}/aplus` : "/api/supplier-portal/pending-media";
}

/** Xin đường tải lên rồi gửi tệp thẳng tới Cloudflare; trả mã video. */
export async function uploadStreamVideo(productId: string | null, file: File, onProgress: (pct: number) => void, uploadError: string, kind: VideoKind = "aplus"): Promise<string> {
  return uploadStreamVideoAt(aplusUploadEndpoint(productId), file, onProgress, uploadError, kind);
}

/** Như uploadStreamVideo nhưng xin đường tải lên ở `endpoint` (ví dụ A+ doanh nghiệp). */
export async function uploadStreamVideoAt(endpoint: string, file: File, onProgress: (pct: number) => void, uploadError: string, kind: VideoKind = "aplus"): Promise<string> {
  const body = new FormData();
  body.append("kind", "video");
  body.append("video_kind", kind);
  const res = await fetch(endpoint, { method: "POST", body });
  const data = await res.json().catch(() => null) as { ok?: boolean; uploadURL?: string; uid?: string; message?: string; maxSeconds?: number; tooLongMessage?: string } | null;
  if (!res.ok || !data?.ok || !data.uploadURL || !data.uid) throw new Error(data?.message || uploadError);
  // Máy chủ có thể cho ít hơn giới hạn loại video khi gói sắp hết phút: báo ngay, không tải vô ích.
  if (typeof data.maxSeconds === "number") {
    const seconds = await videoDuration(file);
    if (seconds !== null && seconds > data.maxSeconds) throw new Error(data.tooLongMessage || uploadError);
  }
  const upload = new FormData();
  upload.append("file", file);
  await sendWithProgress(data.uploadURL, upload, onProgress).catch(() => { throw new Error(uploadError); });
  return data.uid;
}

/** Thời lượng video (giây) đọc từ siêu dữ liệu trên máy; null khi trình duyệt không đọc được. */
function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | null) => { URL.revokeObjectURL(url); resolve(value); };
    const timer = window.setTimeout(() => done(null), 8000);
    video.preload = "metadata";
    video.onloadedmetadata = () => { window.clearTimeout(timer); done(Number.isFinite(video.duration) ? video.duration : null); };
    video.onerror = () => { window.clearTimeout(timer); done(null); };
    video.src = url;
  });
}

/** Gửi tệp kèm phần trăm đã tải (fetch chưa báo được tiến độ tải lên). */
function sendWithProgress(url: string, body: FormData, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100))); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload_failed"));
    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.send(body);
  });
}
