import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getSupabaseClient, supabaseConfigured } from "@/lib/db/supabase";
import type { AttachmentRef, EmailAttachment } from "@/lib/types";

/**
 * Kho tệp đính kèm email.
 *
 *  - Đã cấu hình Supabase → bucket private `email-attachments` (đặt tên qua
 *    SUPABASE_EMAIL_BUCKET). Tệp chỉ được đọc qua signed URL có thời hạn, không public.
 *  - Chưa / không tới được Supabase → thư mục `data/email-attachments` (chạy demo,
 *    tệp không rời khỏi máy chủ; data/ đã nằm trong .gitignore).
 *
 * Cơ sở dữ liệu KHÔNG bao giờ lưu nội dung tệp: chỉ có bucket, storage_path,
 * file_name, mime_type, size_bytes và liên kết tới email.
 */

export const ATTACHMENT_BUCKET =
  (process.env.SUPABASE_EMAIL_BUCKET ?? "email-attachments").trim() || "email-attachments";

/**
 * Giới hạn theo từng tệp và theo một email.
 * Mỗi tệp đi lên trong MỘT request riêng; Vercel giới hạn thân request 4.5MB nên
 * đặt 4MB/tệp để còn chỗ cho phần multipart. Một email có thể đính kèm nhiều tệp.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MAIL = 10;

/** Thời hạn signed URL (giây) — đủ để trình duyệt tải ngay, không đủ để chia sẻ lại */
export const SIGNED_URL_TTL = 120;

/** Tệp chưa gắn vào email nào sẽ bị coi là mồ côi sau khoảng thời gian này */
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

/** Đuôi tệp được phép gửi cho buyer/NCC */
const ALLOWED_EXT = new Set([
  "pdf", "jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf",
  "csv", "txt", "zip", "rar", "7z", "dwg", "dxf", "ai", "psd",
]);

/** Đuôi tệp luôn bị chặn (thực thi / script / có thể chạy được) */
const BLOCKED_EXT = new Set([
  "exe", "dll", "bat", "cmd", "com", "scr", "msi", "msp", "jar", "sh", "bash",
  "ps1", "psm1", "vbs", "vbe", "js", "jse", "mjs", "wsf", "wsh", "hta", "cpl",
  "apk", "app", "dmg", "pif", "reg", "lnk", "iso", "img", "svg", "html", "htm",
  "xhtml", "php", "asp", "aspx", "jsp", "cgi", "py", "rb", "pl",
]);

const BLOCKED_MIME = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sh",
  "application/x-bat",
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);

/** MIME đoán theo đuôi khi trình duyệt không gửi kèm */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  rtf: "application/rtf",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
};

export type AttachmentDriver = "supabase" | "local";

export interface StoredAttachment {
  id: string;
  driver: AttachmentDriver;
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/* ----------------------------- kiểm tra đầu vào ----------------------------- */

export class AttachmentError extends Error {}

/** Bỏ đường dẫn thư mục, ký tự điều khiển, ký tự cấm của Windows và giới hạn độ dài */
export function sanitizeFileName(raw: string): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const trimmed = cleaned.replace(/^\.+/, "").slice(0, 160).trim();
  return trimmed || "tep-dinh-kem";
}

export function extensionOf(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length < 2) return "";
  const ext = parts.pop() ?? "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

export interface ValidatedUpload {
  fileName: string;
  ext: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Kiểm tra loại tệp, kích thước, tên tệp trước khi lưu */
export function validateUpload(rawName: string, mimeType: string, bytes: Uint8Array): ValidatedUpload {
  const fileName = sanitizeFileName(rawName);
  if (!fileName || fileName === "tep-dinh-kem") {
    throw new AttachmentError("Tên tệp không hợp lệ.");
  }
  if (bytes.byteLength === 0) throw new AttachmentError(`Tệp "${fileName}" rỗng.`);
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new AttachmentError(
      `Tệp "${fileName}" vượt quá ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB.`,
    );
  }

  const ext = extensionOf(fileName);
  if (!ext) throw new AttachmentError(`Tệp "${fileName}" phải có phần mở rộng (ví dụ .pdf).`);
  if (BLOCKED_EXT.has(ext)) {
    throw new AttachmentError(`Không cho phép gửi tệp .${ext} vì lý do an toàn.`);
  }
  if (!ALLOWED_EXT.has(ext)) {
    throw new AttachmentError(
      `Định dạng .${ext} chưa được hỗ trợ. Cho phép: PDF, ảnh, Word/Excel/PowerPoint, CSV, TXT, ZIP.`,
    );
  }

  const declared = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (declared && BLOCKED_MIME.has(declared)) {
    throw new AttachmentError(`Loại tệp ${declared} không được phép.`);
  }
  const mime = declared && declared !== "application/octet-stream" ? declared : (MIME_BY_EXT[ext] ?? "application/octet-stream");

  return { fileName, ext, mimeType: mime, bytes };
}

/** Đường dẫn trong bucket: chỉ gồm uuid + đuôi đã kiểm tra, không có dữ liệu người dùng nhập */
export function buildStoragePath(ext: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const rel = `email/${yyyy}/${mm}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  return assertSafePath(rel);
}

/** Chặn path traversal và đường dẫn tuyệt đối */
export function assertSafePath(rel: string): string {
  const clean = (rel ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.includes("..") || clean.includes("\0")) {
    throw new AttachmentError("Đường dẫn tệp không hợp lệ.");
  }
  return clean;
}

/* ------------------------------- kho lưu trữ ------------------------------- */

const LOCAL_ROOT = path.join(process.cwd(), "data", "email-attachments");

const globalForAttachments = globalThis as unknown as {
  __veximAttachDown?: { at: number; reason: string } | null;
  __veximAttachBucketReady?: boolean;
};

const RETRY_AFTER_MS = 60_000;

function markDown(error: unknown) {
  globalForAttachments.__veximAttachDown = {
    at: Date.now(),
    reason: error instanceof Error ? error.message : String(error),
  };
}

function markedDown(): string | null {
  const down = globalForAttachments.__veximAttachDown;
  if (!down) return null;
  if (Date.now() - down.at > RETRY_AFTER_MS) {
    globalForAttachments.__veximAttachDown = null;
    return null;
  }
  return down.reason;
}

/** Lỗi kết nối (mạng/VPN/tường lửa) thì mới dùng kho local; lỗi khác phải báo nguyên nhân */
function looksLikeConnectionError(error: unknown): boolean {
  const text = (
    error instanceof Error
      ? `${error.name} ${error.message} ${(error.cause as { code?: string } | undefined)?.code ?? ""}`
      : String(error)
  ).toLowerCase();
  return [
    "fetch failed", "failed to fetch", "network", "econnreset", "econnrefused",
    "enotfound", "eai_again", "etimedout", "und_err", "socket hang up", "aborted", "timeout",
  ].some((n) => text.includes(n));
}

function supabaseUsable(): boolean {
  return supabaseConfigured() && !markedDown();
}



/** Tạo bucket private nếu chưa có (chỉ chạy được ở phía máy chủ với khoá service_role) */
export async function ensureAttachmentBucket(): Promise<void> {
  if (globalForAttachments.__veximAttachBucketReady || !supabaseUsable()) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { data } = await client.storage.getBucket(ATTACHMENT_BUCKET);
    if (data) {
      globalForAttachments.__veximAttachBucketReady = true;
      return;
    }
    const { error } = await client.storage.createBucket(ATTACHMENT_BUCKET, {
      public: false,
      fileSizeLimit: MAX_FILE_BYTES,
    });
    if (error && !/already exists/i.test(error.message)) throw error;
    globalForAttachments.__veximAttachBucketReady = true;
  } catch (error) {
    if (!looksLikeConnectionError(error)) {
      console.warn("[mail] Không tạo/kiểm tra được bucket đính kèm:", error);
      return;
    }
    markDown(error);
  }
}

async function localPut(rel: string, bytes: Uint8Array) {
  const full = path.join(LOCAL_ROOT, assertSafePath(rel));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
}

async function localGet(rel: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(path.join(LOCAL_ROOT, assertSafePath(rel))));
  } catch {
    return null;
  }
}

async function localDelete(rel: string) {
  try {
    await fs.rm(path.join(LOCAL_ROOT, assertSafePath(rel)), { force: true });
  } catch {
    /* bỏ qua */
  }
}

/** Đưa tệp lên kho. Trả về driver thực tế đã dùng. */
export async function putAttachmentObject(
  rel: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<AttachmentDriver> {
  const clean = assertSafePath(rel);

  if (supabaseUsable()) {
    await ensureAttachmentBucket();
    if (supabaseUsable()) {
      try {
        const { error } = await getSupabaseClient()!
          .storage.from(ATTACHMENT_BUCKET)
          .upload(clean, bytes, { contentType, upsert: false });
        if (error) throw error;
        return "supabase";
      } catch (error) {
        if (!looksLikeConnectionError(error)) {
          throw new AttachmentError(
            `Không lưu được tệp lên Supabase Storage: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        markDown(error);
      }
    }
  }

  try {
    await localPut(clean, bytes);
  } catch (err) {
    // Thường gặp khi chạy trên máy chủ không có ổ đĩa ghi được (ví dụ Vercel)
    throw new AttachmentError(
      "Không lưu được tệp: Supabase Storage chưa kết nối được và máy chủ này không có thư mục dữ liệu ghi được.",
      { cause: err },
    );
  }
  return "local";
}

export async function getAttachmentObject(
  rel: string,
): Promise<{ bytes: Uint8Array; driver: AttachmentDriver } | null> {
  const clean = assertSafePath(rel);

  if (supabaseUsable()) {
    try {
      const { data, error } = await getSupabaseClient()!.storage.from(ATTACHMENT_BUCKET).download(clean);
      if (error) throw error;
      if (data) return { bytes: new Uint8Array(await data.arrayBuffer()), driver: "supabase" };
    } catch (error) {
      if (!looksLikeConnectionError(error)) return null;
      markDown(error);
    }
  }

  const local = await localGet(clean);
  return local ? { bytes: local, driver: "local" } : null;
}

export async function removeAttachmentObject(rel: string): Promise<void> {
  const clean = assertSafePath(rel);
  if (supabaseUsable()) {
    try {
      const { error } = await getSupabaseClient()!.storage.from(ATTACHMENT_BUCKET).remove([clean]);
      if (error && !/not found/i.test(error.message)) throw error;
    } catch (error) {
      if (!looksLikeConnectionError(error)) {
        console.warn("[mail] Không xoá được tệp trên Supabase Storage:", error);
      } else {
        markDown(error);
      }
    }
  }
  await localDelete(clean);
}

/**
 * Signed URL có thời hạn để tải tệp (không dùng public URL).
 * Kho local không có signed URL — nơi gọi tự phục vụ tệp qua route đã kiểm tra quyền.
 */
export async function createAttachmentSignedUrl(
  rel: string,
  ttl = SIGNED_URL_TTL,
  options?: { download?: string | boolean },
): Promise<string | null> {
  const clean = assertSafePath(rel);
  if (!supabaseUsable()) return null;
  try {
    const { data, error } = await getSupabaseClient()!
      .storage.from(ATTACHMENT_BUCKET)
      .createSignedUrl(clean, ttl, options?.download ? { download: options.download } : undefined);
    if (error) throw error;
    return data?.signedUrl ?? null;
  } catch (error) {
    if (!looksLikeConnectionError(error)) {
      console.warn("[mail] Không tạo được signed URL:", error);
    } else {
      markDown(error);
    }
    return null;
  }
}

/** Đọc tệp và chuyển sang base64 CHỈ ĐỂ gửi qua Resend — không lưu vào cơ sở dữ liệu */
export async function loadForSend(
  rows: EmailAttachment[],
): Promise<{ filename: string; content: string; contentType: string }[]> {
  const out: { filename: string; content: string; contentType: string }[] = [];
  for (const row of rows) {
    const found = await getAttachmentObject(row.storage_path);
    if (!found) {
      throw new AttachmentError(
        `Không đọc được tệp "${row.file_name}" từ kho lưu trữ (có thể tệp đã bị xoá).`,
      );
    }
    out.push({
      filename: row.file_name,
      content: Buffer.from(found.bytes).toString("base64"),
      contentType: row.mime_type || "application/octet-stream",
    });
  }
  return out;
}

/** Tham chiếu rút gọn để lưu trong email_messages.attachments (chỉ metadata) */
export function toRef(row: EmailAttachment): AttachmentRef {
  return {
    id: row.id,
    name: row.file_name,
    size: row.size_bytes,
    type: row.mime_type,
    status: row.status,
  };
}


