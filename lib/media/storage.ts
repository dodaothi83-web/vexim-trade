import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { getSupabaseClient, supabaseConfigured } from "@/lib/db/supabase";
import { localFallbackAllowed } from "@/lib/db";
import { r2Delete, r2Get, r2GetHead, r2PresignGet, r2PresignPut, r2PrivateBucket, r2Put, r2PutNew, r2PublicBucket, r2Size } from "@/lib/media/r2";
import { CDN_IMAGE_FILE, R2_PUBLIC_FILE } from "@/lib/media/public-url";

/**
 * Kho tệp media: tự chọn nơi lưu theo đúng triết lý của tầng dữ liệu.
 *
 *  - Đã cấu hình Supabase  → bucket `vexim-media` (đặt tên qua SUPABASE_MEDIA_BUCKET)
 *  - Chỉ ở local/E2B khi fallback được phép → `data/media`.
 *    Preview/staging/production phải báo lỗi thay vì ghi vào ổ đĩa serverless.
 *  - Ảnh mới lưu ở Cloudflare R2 khi đã cấu hình (xem lib/media/r2.ts):
 *      ảnh đại diện/ảnh bìa `profile-r2-…`/`cover-r2-…` → bucket R2 công khai;
 *      ảnh sản phẩm, ảnh form sản phẩm, ảnh A+ → bucket R2 riêng tư (vẫn qua /public-media).
 *    Đường dẫn lưu trong DB giữ nguyên dạng tương đối. Khi đọc, tệp chưa có trên R2 (ảnh cũ)
 *    được lấy từ Supabase như trước, nên không phải di chuyển hay sửa dữ liệu cũ.
 */

export type MediaDriver = "supabase" | "local" | "r2";

/** Ảnh sản phẩm và ảnh A+: cần kiểm tra quyền trước khi phát nên chỉ lưu ở bucket riêng tư. */
const R2_PRIVATE_PREFIX = /^(?:products|product-form-images|aplus|chat)\//;

/** Bucket R2 cho một đường dẫn, hoặc null nếu đường dẫn đó vẫn dùng Supabase. */
function r2BucketFor(rel: string): string | null {
  if (R2_PUBLIC_FILE.test(rel) || CDN_IMAGE_FILE.test(rel)) return r2PublicBucket();
  if (R2_PRIVATE_PREFIX.test(rel)) return r2PrivateBucket();
  return null;
}

/** Đường dẫn ảnh đại diện/ảnh bìa mới: lưu thẳng lên R2 công khai khi đã cấu hình. */
export function supplierProfileImagePath(supplierId: string, kind: "profile" | "cover", id: string): string {
  return r2PublicBucket()
    ? `suppliers/${supplierId}/${kind}-r2-${id}.webp`
    : `suppliers/${supplierId}/${kind}-${id}.webp`;
}

/** Ảnh trên bucket công khai có tên ngẫu nhiên, không bao giờ bị ghi đè: cho CDN giữ lâu. */
const R2_PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface MediaStorageStatus {
  driver: MediaDriver;
  bucket: string | null;
  /** true khi đã cấu hình Supabase nhưng phải tạm lưu ở đĩa */
  degraded: boolean;
  reason: string | null;
  root: string;
}

const LOCAL_ROOT = path.join(process.cwd(), "data", "media");

const globalForMedia = globalThis as unknown as {
  __veximMediaDown?: { at: number; reason: string } | null;
};

const RETRY_AFTER_MS = 60_000;

export function mediaBucket(): string {
  return (process.env.SUPABASE_MEDIA_BUCKET ?? "vexim-media").trim() || "vexim-media";
}

function markDown(error: unknown) {
  globalForMedia.__veximMediaDown = {
    at: Date.now(),
    reason: error instanceof Error ? error.message : String(error),
  };
}

function markedDown(): string | null {
  const down = globalForMedia.__veximMediaDown;
  if (!down) return null;
  if (Date.now() - down.at > RETRY_AFTER_MS) {
    globalForMedia.__veximMediaDown = null;
    return null;
  }
  return down.reason;
}

function looksLikeConnectionError(error: unknown): boolean {
  const text = (
    error instanceof Error
      ? `${error.name} ${error.message} ${(error.cause as { code?: string } | undefined)?.code ?? ""}`
      : String(error)
  ).toLowerCase();
  return [
    "fetch failed",
    "failed to fetch",
    "network",
    "econnreset",
    "econnrefused",
    "enotfound",
    "eai_again",
    "etimedout",
    "und_err",
    "socket hang up",
    "aborted",
    "timeout",
  ].some((n) => text.includes(n));
}

function supabaseUsable(): boolean {
  return supabaseConfigured() && !markedDown();
}

export function mediaStorageStatus(): MediaStorageStatus {
  const down = markedDown();
  return {
    driver: supabaseUsable() ? "supabase" : "local",
    bucket: supabaseConfigured() ? mediaBucket() : null,
    degraded: Boolean(down) && localFallbackAllowed(),
    reason: down,
    root: LOCAL_ROOT,
  };
}

function safePath(rel: string): string {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.includes("..")) throw new Error("Đường dẫn tệp không hợp lệ");
  return clean;
}

async function localPut(rel: string, data: Uint8Array) {
  const full = path.join(LOCAL_ROOT, safePath(rel));
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

async function localGet(rel: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(path.join(LOCAL_ROOT, safePath(rel))));
  } catch {
    return null;
  }
}

async function localDelete(rel: string) {
  // force=true đã bỏ qua tệp không tồn tại; lỗi quyền/ổ đĩa phải được báo cho caller.
  await fs.rm(path.join(LOCAL_ROOT, safePath(rel)), { force: true });
}

/** Lưu một tệp. Tự chuyển sang đĩa nếu Supabase Storage lỗi kết nối. */
export async function putObject(
  rel: string,
  data: Uint8Array,
  contentType: string,
): Promise<{ driver: MediaDriver; path: string }> {
  const clean = safePath(rel);
  // Form-review images are write-once. Generic legacy uploads must not overwrite them.
  if (clean.startsWith("product-form-images/")) throw new Error("Không thể ghi đè ảnh sản phẩm đã lưu.");

  const r2Bucket = r2BucketFor(clean);
  if (r2Bucket) {
    await r2Put(r2Bucket, clean, data, contentType, R2_PUBLIC_FILE.test(clean) || CDN_IMAGE_FILE.test(clean) ? R2_PUBLIC_CACHE_CONTROL : undefined);
    return { driver: "r2", path: clean };
  }

  if (supabaseUsable()) {
    try {
      const { error } = await getSupabaseClient()!
        .storage.from(mediaBucket())
        .upload(clean, data, { contentType, upsert: true });
      if (error) throw error;
      return { driver: "supabase", path: clean };
    } catch (error) {
      if (!looksLikeConnectionError(error) || !localFallbackAllowed()) throw error;
      markDown(error);
      console.warn("[media] Supabase Storage lỗi kết nối, lưu tạm vào data/media (chỉ dev/E2B):", error);
    }
  }

  if (!localFallbackAllowed()) {
    throw new Error("Supabase Storage không khả dụng; không được lưu ảnh vào ổ đĩa tạm ở preview/staging/production.");
  }
  await localPut(clean, data);
  return { driver: "local", path: clean };
}

/**
 * Write an immutable new object. Unlike putObject, this never overwrites an
 * existing path and never falls back after an ambiguous remote failure. Callers
 * must treat a thrown network error as an unknown outcome, not as proof that no
 * object was created.
 */
export async function putNewObject(rel: string, data: Uint8Array, contentType: string): Promise<void> {
  const clean = safePath(rel);
  const r2Bucket = r2BucketFor(clean);
  if (r2Bucket) {
    await r2PutNew(r2Bucket, clean, data, contentType);
    return;
  }
  if (supabaseConfigured()) {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase Storage không khả dụng");
    const { error } = await client.storage.from(mediaBucket()).upload(clean, data, { contentType, upsert: false });
    if (error) throw error;
    return;
  }
  if (!localFallbackAllowed()) throw new Error("Supabase Storage không khả dụng");
  const full = path.join(LOCAL_ROOT, clean);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data, { flag: "wx" });
}

export async function getObject(
  rel: string,
): Promise<{ data: Uint8Array; driver: MediaDriver } | null> {
  const clean = safePath(rel);

  const r2Bucket = r2BucketFor(clean);
  if (r2Bucket) {
    try {
      const data = await r2Get(r2Bucket, clean);
      if (data) return { data, driver: "r2" };
      // Bản sao CDN chỉ có trên R2 công khai: không có thì thôi, không hỏi Supabase.
      if (CDN_IMAGE_FILE.test(clean)) return null;
      // Không có trên R2: ảnh cũ lưu ở Supabase, đọc tiếp như trước.
    } catch (error) {
      // R2 tạm lỗi: ảnh cũ vẫn phải hiển thị từ Supabase.
      console.error("[media] R2 read failed", clean, error);
    }
  }

  if (supabaseUsable()) {
    try {
      const { data, error } = await getSupabaseClient()!
        .storage.from(mediaBucket())
        .download(clean);
      if (error) throw error;
      if (data) {
        return { data: new Uint8Array(await data.arrayBuffer()), driver: "supabase" };
      }
    } catch (error) {
      if (!looksLikeConnectionError(error) || !localFallbackAllowed()) throw error;
      markDown(error);
    }
  }

  if (!localFallbackAllowed()) {
    throw new Error("Supabase Storage không khả dụng; không đọc ảnh từ ổ đĩa tạm ở preview/staging/production.");
  }
  const local = await localGet(clean);
  return local ? { data: local, driver: "local" } : null;
}

export async function deleteObject(rel: string): Promise<void> {
  const clean = safePath(rel);
  // Cleanup for this namespace needs a separate reference-checked workflow.
  if (clean.startsWith("product-form-images/")) throw new Error("Không thể xóa ảnh sản phẩm theo đường dẫn này.");
  const r2Bucket = r2BucketFor(clean);
  if (r2Bucket) {
    await r2Delete(r2Bucket, clean);
    // Ảnh mới chỉ nằm trên R2. Ảnh cũ (cùng dạng đường dẫn) vẫn được xoá ở Supabase bên dưới.
    if (R2_PUBLIC_FILE.test(clean) || CDN_IMAGE_FILE.test(clean)) return;
  }
  if (supabaseUsable()) {
    try {
      const { error } = await getSupabaseClient()!.storage.from(mediaBucket()).remove([clean]);
      if (error) throw error;
    } catch (error) {
      if (looksLikeConnectionError(error)) markDown(error);
      // Không coi bản local đã xóa là bằng chứng tệp trên Storage cũng đã bị xóa.
      throw error;
    }
  } else if (supabaseConfigured() || !localFallbackAllowed()) {
    throw new Error("Supabase Storage không khả dụng; chưa thể xóa tệp.");
  }
  await localDelete(clean);
}

/* ---------- Tệp chat (`chat/…`): luôn ở bucket R2 riêng tư khi đã cấu hình ---------- */

/** Link tải thẳng lên kho cho trình duyệt; null khi kho không phải R2 (khi đó tải qua máy chủ). */
export async function presignedUpload(rel: string, contentType: string): Promise<string | null> {
  const clean = safePath(rel);
  const bucket = r2BucketFor(clean);
  return bucket ? r2PresignPut(bucket, clean, contentType) : null;
}

/** Link đọc có hạn ngắn; null khi kho không phải R2 (khi đó máy chủ tự phát nội dung tệp). */
export async function presignedDownload(rel: string, options: { contentType: string; disposition: string }): Promise<string | null> {
  const clean = safePath(rel);
  const bucket = r2BucketFor(clean);
  return bucket ? r2PresignGet(bucket, clean, options) : null;
}

/** Dung lượng và vài KB đầu của tệp đã tải lên, để kiểm tra trước khi cho gửi. null khi chưa có tệp. */
export async function inspectObject(rel: string, headBytes = 4096): Promise<{ size: number; head: Uint8Array } | null> {
  const clean = safePath(rel);
  const bucket = r2BucketFor(clean);
  if (bucket) {
    const size = await r2Size(bucket, clean);
    if (size === null) return null;
    const head = await r2GetHead(bucket, clean, headBytes);
    return head ? { size, head } : null;
  }
  const object = await getObject(clean);
  return object ? { size: object.data.byteLength, head: object.data.slice(0, headBytes) } : null;
}
