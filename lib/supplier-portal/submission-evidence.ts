import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { isPartnerL2 } from "@/lib/l2-scope";
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
  PartnerEvidenceKey,
  L2VerificationScope,
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
 *  2. Tạo thumbnail ở server. Chỉ L2 tạo bản giảm cỡ AI; L3 không gửi tệp đến AI.
 */

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];

export interface SubmissionFileCheck {
  ok: boolean;
  message?: string;
}

export function allowedMimes(level: 2 | 3, scope?: L2VerificationScope | null, key?: string): string[] {
  return level === 3 || (level === 2 && scope === "partner_contract" && key === "partner_factory_contract")
    ? [...IMAGE_MIME, "application/pdf"] : IMAGE_MIME;
}

export function maxBytesFor(level: 2 | 3, scope?: L2VerificationScope | null, key?: string): number {
  return level === 3 || (scope === "partner_contract" && key === "partner_factory_contract") ? MAX_L3_DOC_BYTES : MAX_L2_PHOTO_BYTES;
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

export function validItemKey(level: 2 | 3, key: string, scope?: L2VerificationScope | null): boolean {
  return submissionItemKeys(level, scope).includes(key);
}

/** Đọc và kiểm tra tệp ảnh/chứng từ TRƯỚC khi ghi vào kho. */
export async function readSubmissionFile(level: 2 | 3, key: string, file: File, scope?: L2VerificationScope | null): Promise<{
  bytes: Uint8Array;
  mime: string;
  kind: "image" | "document";
  exif: ReturnType<typeof parseExif>;
  message?: string;
}> {
  if (!validItemKey(level, key, scope)) throw new Error("Mục bằng chứng không hợp lệ.");
  if (!file.size) throw new Error("Tệp rỗng.");
  const limit = maxBytesFor(level, scope, key);
  if (file.size > limit) throw new Error(`Tệp vượt giới hạn ${Math.round(limit / 1024 / 1024)} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  const allowed = allowedMimes(level, scope, key);
  if (!mime) throw new Error(allowed.includes("application/pdf")
    ? "Không nhận dạng được tệp. Hãy gửi ảnh JPG/PNG/WebP hoặc PDF."
    : "Không nhận dạng được tệp. Hãy gửi ảnh JPG/PNG/WebP.");
  if (!allowed.includes(mime)) {
    throw new Error(allowed.includes("application/pdf")
      ? `Mục này nhận ảnh JPG/PNG/WebP hoặc PDF, tệp này là ${mime}.`
      : `Mục này chỉ nhận ảnh JPG/PNG/WebP, tệp này là ${mime}.`);
  }
  const exif = mime === "application/pdf" ? parseExif(new Uint8Array()) : parseExif(bytes);
  return { bytes, mime, kind: mime === "application/pdf" ? "document" : "image", exif };
}

/** Ảnh xem trước; L2 mới tạo thêm bản giảm cỡ AI. Thiếu thumbnail vẫn giữ được tệp gốc. */
export async function derivePreviews(mime: string, bytes: Uint8Array, includeAi = true): Promise<{
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
    const forAi = includeAi ? await sharp(bytes, { limitInputPixels: 60_000_000, failOn: "error" })
      .rotate()
      .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer() : null;
    return {
      thumb: new Uint8Array(thumb),
      forAi: !forAi || forAi.byteLength > MAX_AI_SUBMISSION_FILE_BYTES ? null : new Uint8Array(forAi),
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
 *  - L3 giữ tối đa ba tệp mỗi mục, không tự xoá chứng từ đã tải
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
  const manual = submission.target_level === 3 || isPartnerL2(submission);
  if (!validItemKey(submission.target_level, key, submission.l2_scope)) throw new Error("Mục bằng chứng không hợp lệ.");
  if (manual) {
    const current = (await store.listSubmissionItems(submission.id)).filter((item) => item.checklist_key === key && item.media_id);
    if (current.length >= MAX_ITEMS_PER_KEY) {
      throw new Error(`Mỗi mục giữ tối đa ${MAX_ITEMS_PER_KEY} tệp. Hãy xóa một tệp trước khi tải thêm.`);
    }
  }

  const read = await readSubmissionFile(submission.target_level, key, input.file, submission.l2_scope);
  const previews = await derivePreviews(read.mime, read.bytes, !manual);

  const flags = !manual
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
  if (!manual && requiresHandwrittenCode(key) && !submission.verification_code) {
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
  try {
    if (previews.thumb && thumbPath) await putObject(thumbPath, previews.thumb, "image/jpeg");
  } catch (error) {
    await deleteObject(mainPath).catch(() => null);
    throw error;
  }

  let media: MediaAsset;
  try {
    media = await store.createMedia({
      // Bằng chứng tự gửi là chủ sở hữu RIÊNG: `submission_id` trỏ tới
      // supplier_submissions(id). Tuyệt đối không ghi id hồ sơ vào
      // `verification_id` (cột đó có khoá ngoại tới verifications(id)).
      owner_type: "submission",
      verification_id: null,
      submission_id: submission.id,
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

  let replaced = 0;
  let item: SupplierSubmissionItem;
  try {
    // Kiểm lại trước khi thay ảnh: hồ sơ có thể vừa được nộp ở một tab khác.
    const freshBeforeReplacement = await store.getSubmission(submission.id);
    if (!freshBeforeReplacement || !submissionAcceptsUploads(freshBeforeReplacement)) throw new Error("Hồ sơ đã nộp/đã xét; không thể tải thêm bằng chứng.");
    // Giữ nguyên cách thay ảnh L2; L3 chỉ xoá khi NCC chủ động chọn tệp.
    if (!manual) {
      const existing = (await store.listSubmissionItems(submission.id))
        .filter((i) => i.checklist_key === key && i.media_id)
        .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
      const toReplace = existing.slice(Math.max(0, existing.length - (MAX_ITEMS_PER_KEY - 1)));
      for (const old of toReplace) {
        await removeSubmissionItem(store, old);
        replaced += 1;
      }
    }

    // Bảo vệ trường hợp trạng thái đổi trong lúc tải. Lần kiểm thứ hai cũng
    // tránh nhận tệp thứ tư khi một tab khác vừa tải xong.
    const fresh = await store.getSubmission(submission.id);
    if (!fresh || !submissionAcceptsUploads(fresh)) throw new Error("Hồ sơ đã nộp/đã xét; không thể tải thêm bằng chứng.");
    if (manual) {
      const current = (await store.listSubmissionItems(submission.id)).filter((row) => row.checklist_key === key && row.media_id);
      if (current.length >= MAX_ITEMS_PER_KEY) throw new Error(`Mỗi mục giữ tối đa ${MAX_ITEMS_PER_KEY} tệp. Hãy xóa một tệp trước khi tải thêm.`);
    }
    item = await store.createSubmissionItem({
      submission_id: submission.id,
      supplier_id: submission.supplier_id,
      checklist_key: key as FactoryPhotoKey | PartnerEvidenceKey | ExportDocKey,
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
  } catch (error) {
    // Dọn tệp mới khi lưu lỗi; L3 không tự xoá các tệp đã có.
    await store.deleteMedia(media.id).catch(() => null);
    await deleteObject(mainPath).catch(() => null);
    if (thumbPath) await deleteObject(thumbPath).catch(() => null);
    throw error;
  }
  return { item, media, flags, replaced };
}

/** Xoá một mục bằng chứng cùng tệp trong kho. */
export async function removeSubmissionItem(store: DataStore, item: SupplierSubmissionItem): Promise<void> {
  // Chỉ xoá file sau khi bỏ được bản ghi; lỗi CSDL không làm mất chứng từ.
  await store.deleteSubmissionItem(item.id);
  if (item.media_id) await store.deleteMedia(item.media_id).catch(() => null);
  for (const path of [item.storage_path, item.thumb_path]) {
    if (!path) continue;
    try {
      if (!await store.getMediaByPath(path)) await deleteObject(path);
    } catch (error) {
      console.error("[submission-evidence] shared-path cleanup failed", error);
    }
  }
}
