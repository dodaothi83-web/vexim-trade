/** Giới hạn & quy tắc cho từng loại tệp — dùng chung server và client. */
import type { MediaKind } from "@/lib/types";

export const MEDIA_LIMITS = {
  /** Ảnh đã nén ở trình duyệt nên hiếm khi quá 2MB; chặn ở 8MB cho an toàn */
  image: 8 * 1024 * 1024,
  /** Catalogue / bảng thông số PDF */
  catalogue: 15 * 1024 * 1024,
  /** Chứng nhận (PDF hoặc ảnh) */
  certificate: 15 * 1024 * 1024,
  /** Giấy tờ xác minh nội bộ */
  document: 15 * 1024 * 1024,
} as const;

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp"] as const;
export const PDF_MIME = ["application/pdf"] as const;

/** Kích thước tối đa sau khi nén ảnh ở trình duyệt */
export const IMAGE_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 400;

export const MEDIA_KINDS: { value: MediaKind; label: string; hint: string }[] = [
  { value: "image", label: "Ảnh", hint: "Ảnh sản phẩm, bao bì, nhãn, nhà máy" },
  { value: "catalogue", label: "Catalogue / bảng thông số", hint: "Tệp PDF gửi buyer xem chi tiết" },
  { value: "certificate", label: "Chứng nhận", hint: "PDF hoặc ảnh, có thể đặt ngày hết hạn" },
  { value: "document", label: "Giấy tờ nội bộ", hint: "Giấy phép, xác minh NCC — chỉ nội bộ xem" },
  { value: "video", label: "Video (link)", hint: "Dán link YouTube / Drive, hệ thống không tải tệp" },
];

export function limitFor(kind: MediaKind): number {
  if (kind === "image") return MEDIA_LIMITS.image;
  if (kind === "catalogue") return MEDIA_LIMITS.catalogue;
  if (kind === "certificate") return MEDIA_LIMITS.certificate;
  return MEDIA_LIMITS.document;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
