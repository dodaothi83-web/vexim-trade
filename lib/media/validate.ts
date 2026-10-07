import type { MediaKind } from "@/lib/types";
import { IMAGE_MIME, PDF_MIME, limitFor } from "@/lib/media/limits";

/** Nhận dạng tệp bằng magic bytes — không tin phần mở rộng hay mime do client khai. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const b = bytes;

  // %PDF
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return "application/pdf";
  }
  // FF D8 FF  → JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // 89 50 4E 47 0D 0A 1A 0A → PNG
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png";
  }
  // RIFF .... WEBP
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "application/pdf") return "pdf";
  return "bin";
}

export interface ValidationResult {
  ok: boolean;
  mime?: string;
  message?: string;
}

/** Kiểm tra loại tệp có được phép với `kind` và dung lượng có nằm trong giới hạn. */
export function validateUpload(
  kind: MediaKind,
  bytes: Uint8Array,
  declaredName: string,
): ValidationResult {
  if (kind === "video") {
    return {
      ok: false,
      message: "Video chỉ nhận dạng link — dán link YouTube / Drive thay vì tải tệp.",
    };
  }

  const mime = sniffMime(bytes);
  if (!mime) {
    return {
      ok: false,
      message: `Tệp "${declaredName}" không phải ảnh (JPG/PNG/WebP) hay PDF hợp lệ.`,
    };
  }

  const allowed: readonly string[] =
    kind === "image" ? IMAGE_MIME : kind === "catalogue" ? PDF_MIME : [...PDF_MIME, ...IMAGE_MIME];

  if (!allowed.includes(mime)) {
    const want = kind === "image" ? "JPG / PNG / WebP" : kind === "catalogue" ? "PDF" : "PDF hoặc ảnh";
    return { ok: false, message: `Mục này chỉ nhận ${want} — tệp "${declaredName}" là ${mime}.` };
  }

  const limit = limitFor(kind);
  if (bytes.byteLength > limit) {
    return {
      ok: false,
      message: `Tệp "${declaredName}" vượt giới hạn ${Math.round(limit / 1024 / 1024)}MB.`,
    };
  }

  return { ok: true, mime };
}
