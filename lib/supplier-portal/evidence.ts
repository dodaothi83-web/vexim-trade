import "server-only";

import { randomUUID } from "node:crypto";

import type { DataStore } from "@/lib/db/types";
import { extensionFor, validateUpload } from "@/lib/media/validate";
import { deleteObject, putObject } from "@/lib/media/storage";
import type { AuditEvidenceKey, MediaAsset, Verification } from "@/lib/types";
import { INITIAL_DOCUMENT_KEYS } from "./policy";

export const MAX_INITIAL_FILES = 5;
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export async function validateInitialDocument(file: File, key: string): Promise<{ bytes: Uint8Array; mime: string; kind: "image" | "document" }> {
  if (!INITIAL_DOCUMENT_KEYS.includes(key as typeof INITIAL_DOCUMENT_KEYS[number])) throw new Error("Mục tài liệu không hợp lệ.");
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) throw new Error("Mỗi tệp phải có dữ liệu và không vượt quá 15 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 ? "document" : "image";
  const check = validateUpload(kind, bytes, file.name);
  if (!check.ok || !check.mime) throw new Error(check.message ?? "Tệp không hợp lệ.");
  return { bytes, mime: check.mime, kind };
}

/** Persist only internal, L1-scoped media. No buyer-visible supplier gallery or staff audit verdict. */
export async function saveDocumentEvidence(input: {
  store: DataStore;
  review: Verification;
  key: AuditEvidenceKey;
  file: File;
  createdBy: string | null;
  prepared?: Awaited<ReturnType<typeof validateInitialDocument>>;
}): Promise<MediaAsset> {
  if (input.review.target_level !== 1 || !INITIAL_DOCUMENT_KEYS.includes(input.key as typeof INITIAL_DOCUMENT_KEYS[number])) throw new Error("Chỉ nhận giấy tờ bước đầu.");
  const { bytes, mime, kind } = input.prepared ?? await validateInitialDocument(input.file, input.key);
  const path = `verifications/${input.review.id}/${randomUUID()}.${extensionFor(mime)}`;
  await putObject(path, bytes, mime);
  try {
    return await input.store.createMedia({
      owner_type: "verification", verification_id: input.review.id, supplier_id: input.review.supplier_id,
      product_id: null, checklist_key: input.key, kind, audience: "internal", status: "unverified",
      expires_on: null, caption: input.file.name.slice(0, 150), storage_path: path,
      thumb_path: null, external_url: null, mime, bytes: bytes.byteLength,
      width: null, height: null, sort_order: 0, created_by: input.createdBy,
    });
  } catch (error) {
    await deleteObject(path).catch(() => null);
    throw error;
  }
}
