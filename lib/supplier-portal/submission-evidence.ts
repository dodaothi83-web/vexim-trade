import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { deleteObject, putObject } from "@/lib/media/storage";
import { extensionFor, sniffMime } from "@/lib/media/validate";
import { parseExif } from "@/lib/media/exif";
import { photoIntegrityFlags, type GpsSample } from "@/lib/media/image-integrity";
import {
  MAX_AI_SUBMISSION_FILE_BYTES,
} from "@/lib/ai/evidence-review";
import {
  MAX_ITEMS_PER_KEY,
  MAX_L2_PHOTO_BYTES,
  MAX_L3_DOC_BYTES,
  SUBMISSION_THUMB_SIDE,
  requiresHandwrittenCode,
  submissionEditable,
  submissionItemKeys,
  submissionItemLabel,
} from "@/lib/verification-submission";
import type { DataStore } from "@/lib/db/types";
import type {
  ExportDocKey,
  FactoryPhotoKey,
  MediaAsset,
  SubmissionIntegrityFlag,
  SupplierSubmission,
  SupplierSubmissionItem,
} from "@/lib/types";

/**
 * Nhận & lưu bằng chứng do NHÀ CUNG CẤP tự tải lên cho hồ sơ L2/L3.
 *
 * Hai quyết định nghiệp vụ quan trọng:
 *  1. Tệp được giữ NGUYÊN bytes (không nén, không re-encode) để còn đối chiếu.
 *     Từ 21/10/2026 KHÔNG bắt buộc ảnh gốc: ảnh chụp bằng điện thoại, kể cả ảnh
 *     đã gửi qua Zalo/Facebook, đều nhận. EXIF/GPS nếu còn thì ghi lại làm ghi chú.
 *  2. Chỉ tạo thêm ảnh xem trước (thumbnail) và bản giảm cỡ cho AI đọc; cả hai
 *     sinh ra từ bytes gốc ở server, không do client gửi lên.
 */

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

export interface SubmissionFileCheck {
  ok: boolean;
  message?: string;
}

export function allowedMimes(level: 2 | 3): string[] {
  return level === 2 ? IMAGE_MIME : [...IMAGE_MIME, "application/pdf"];
}

export function maxBytesFor(level: 2 | 3): number {
  return level === 2 ? MAX_L2_PHOTO_BYTES : MAX_L3_DOC_BYTES;
}

/** Chặn sớm theo `content-length` để không đọc body vượt hạn mức. */
export function submissionSizeGate(level: 2 | 3, contentLength: number | null): SubmissionFileCheck {
  const limit = maxBytesFor(level);
  if (contentLength == null) return { ok: true };
  if (contentLength > limit + 1024 * 1024) {
    return { ok: false, message: `Tệp vượt giới hạn ${Math.round(limit / 1024 / 1024)} MB cho bước này.` };
  }
  return { ok: true };
}

export function validItemKey(level: 2 | 3, key: string): boolean {
  return submissionItemKeys(level).includes(key);
}

/** Đọc và kiểm tra tệp ảnh/chứng từ TRƯỚC khi ghi vào kho. */
export async function readSubmissionFile(level: 2 | 3, key: string, file: File): Promise<{
  bytes: Uint8Array;
  mime: string;
  kind: "image" | "document";
  exif: ReturnType<typeof parseExif>;
  message?: string;
}> {
  if (!validItemKey(level, key)) throw new Error("Mục bằng chứng không hợp lệ.");
  if (!file.size) throw new Error("Tệp rỗng.");
  const limit = maxBytesFor(level);
  if (file.size > limit) throw new Error(`Tệp vượt giới hạn ${Math.round(limit / 1024 / 1024)} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) throw new Error("Không nhận dạng được tệp. Hãy gửi ẢNH GỐC định dạng JPG/PNG/WebP (L3 nhận thêm PDF).");
  if (!allowedMimes(level).includes(mime)) {
    throw new Error(level === 2
      ? `Bước xác thực nhà máy chỉ nhận ảnh JPG/PNG/WebP, tệp này là ${mime}.`
      : `Bước lịch sử xuất khẩu nhận ảnh JPG/PNG/WebP hoặc PDF — tệp này là ${mime}.`);
  }
  if (level === 2 && mime === "application/pdf") throw new Error("Bước xác thực nhà máy chỉ nhận ảnh chụp.");
  const exif = mime === "application/pdf" ? parseExif(new Uint8Array()) : parseExif(bytes);
  return { bytes, mime, kind: mime === "application/pdf" ? "document" : "image", exif };
}

/** Ảnh xem trước + bản giảm cỡ cho AI. Không ném lỗi: thiếu thumbnail vẫn giữ được ảnh gốc. */
export async function derivePreviews(mime: string, bytes: Uint8Array): Promise<{
  thumb: Uint8Array | null;
  forAi: Uint8Array | null;
  width: number | null;
  height: number | null;
}> {
  if (mime === "application/pdf") return { thumb: null, forAi: null, width: null, height: null };
  try {
    const image = sharp(bytes, { limitInputPixels: 60_000_000, failOn: "error" });
    const meta = await image.metadata();
    const thumb = await sharp(bytes, { limitInputPixels: 60_000_000, failOn: "error" })
      .rotate()
      .resize({ width: SUBMISSION_THUMB_SIDE, height: SUBMISSION_THUMB_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 74 })
      .toBuffer();
    const forAi = await sharp(bytes, { limitInputPixels: 60_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return {
      thumb: new Uint8Array(thumb),
      forAi: forAi.byteLength > MAX_AI_SUBMISSION_FILE_BYTES ? null : new Uint8Array(forAi),
      width: meta.width ?? null,
      height: meta.height ?? null,
    };
  } catch (error) {
    console.warn("[submission-evidence] không tạo được ảnh xem trước:", error instanceof Error ? error.message : error);
    return { thumb: null, forAi: null, width: null, height: null };
  }
}

export function submissionStoragePath(submissionId: string, name: string): string {
  return `supplier-submissions/${submissionId}/${name}`;
}

/** Hồ sơ này có còn được thêm/thay bằng chứng không. */
export function submissionAcceptsUploads(submission: SupplierSubmission): boolean {
  return submissionEditable(submission.status);
}

/**
 * Lưu MỘT ảnh/chứng từ vào hồ sơ tự gửi:
 *  - đọc EXIF từ bytes gốc, sinh cờ đối chứng kỹ thuật
 *  - ghi ảnh gốc + thumbnail vào kho media (audience `internal`)
 *  - thay ảnh cũ cùng mục khi đã tới hạn `MAX_ITEMS_PER_KEY`
 */
export async function saveSubmissionEvidence(input: {
  store: DataStore;
  submission: SupplierSubmission;
  key: string;
  file: File;
  capture: GpsSample & { captured_at?: string | null };
  createdBy: string | null;
}): Promise<{ item: SupplierSubmissionItem; media: MediaAsset; flags: SubmissionIntegrityFlag[]; replaced: number }> {
  const { store, submission, key, capture } = input;
  if (!submissionAcceptsUploads(submission)) throw new Error("Hồ sơ đã nộp/đã xét; không thể tải thêm bằng chứng.");
  if (!validItemKey(submission.target_level, key)) throw new Error("Mục bằng chứng không hợp lệ.");
  const read = await readSubmissionFile(submission.target_level, key, input.file);
  const previews = await derivePreviews(read.mime, read.bytes);

  const flags = submission.target_level === 2
    ? photoIntegrityFlags({
        checklistKey: key,
        exif: read.exif,
        capture,
        width: previews.width,
        height: previews.height,
        codeIssuedAt: submission.code_issued_at,
      })
    : [];
  // Phần bắt buộc duy nhất: ảnh 🔖 phải có tờ mã. Chưa phát hành mã thì nêu cờ chặn nộp.
  if (submission.target_level === 2 && requiresHandwrittenCode(key) && !submission.verification_code) {
    flags.push({
      flag: "code_missing",
      severity: "hard",
      source: "system",
      detail: "Mục này cần tờ mã xác minh nhưng hồ sơ chưa phát hành mã. Bấm “Tạo mã xác minh”, tải tờ mã về rồi chụp lại.",
    });
  }

  const mainPath = submissionStoragePath(submission.id, `${randomUUID()}.${extensionFor(read.mime)}`);
  const thumbPath = previews.thumb ? submissionStoragePath(submission.id, `${randomUUID()}-thumb.jpg`) : null;
  await putObject(mainPath, read.bytes, read.mime);
  if (previews.thumb && thumbPath) await putObject(thumbPath, previews.thumb, "image/jpeg");

  let media: MediaAsset;
  try {
    media = await store.createMedia({
      owner_type: "verification",
      verification_id: submission.id,
      supplier_id: submission.supplier_id,
      product_id: null,
      checklist_key: key as MediaAsset["checklist_key"],
      kind: read.kind,
      audience: "internal",
      status: "unverified",
      expires_on: null,
      caption: `${submissionItemLabel(submission.target_level, key)} · ${input.file.name.slice(0, 100)}`,
      storage_path: mainPath,
      thumb_path: thumbPath,
      external_url: null,
      mime: read.mime,
      bytes: read.bytes.byteLength,
      width: previews.width,
      height: previews.height,
      sort_order: 0,
      created_by: input.createdBy,
    });
  } catch (error) {
    await deleteObject(mainPath).catch(() => null);
    if (thumbPath) await deleteObject(thumbPath).catch(() => null);
    throw error;
  }

  // Giữ tối đa vài ảnh mỗi mục: xoá bản cũ nhất (kèm tệp) để hồ sơ không phình.
  const existing = (await store.listSubmissionItems(submission.id))
    .filter((i) => i.checklist_key === key && i.media_id)
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
  let replaced = 0;
  for (const old of existing.slice(Math.max(0, existing.length - (MAX_ITEMS_PER_KEY - 1)))) {
    await removeSubmissionItem(store, old);
    replaced += 1;
  }

  const item = await store.createSubmissionItem({
    submission_id: submission.id,
    supplier_id: submission.supplier_id,
    checklist_key: key as FactoryPhotoKey | ExportDocKey,
    media_id: media.id,
    storage_path: mainPath,
    thumb_path: thumbPath,
    exif_lat: read.exif.lat,
    exif_lng: read.exif.lng,
    exif_captured_at: read.exif.captured_at,
    exif_camera_make: read.exif.make,
    exif_camera_model: read.exif.model,
    exif_software: read.exif.software,
    has_exif: read.exif.has_exif,
    mime: read.mime,
    bytes: read.bytes.byteLength,
    width: previews.width,
    height: previews.height,
    capture_lat: capture.lat,
    capture_lng: capture.lng,
    capture_accuracy_m: capture.accuracy_m ?? null,
    captured_at: capture.captured_at ?? new Date().toISOString(),
    flags,
  });
  return { item, media, flags, replaced };
}

/** Xoá một mục bằng chứng cùng tệp trong kho. */
export async function removeSubmissionItem(store: DataStore, item: SupplierSubmissionItem): Promise<void> {
  if (item.storage_path) await deleteObject(item.storage_path).catch(() => null);
  if (item.thumb_path) await deleteObject(item.thumb_path).catch(() => null);
  if (item.media_id) await store.deleteMedia(item.media_id).catch(() => null);
  await store.deleteSubmissionItem(item.id);
}
