import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

import { getSupabaseClient, supabaseConfigured } from "@/lib/db/supabase";

/**
 * Kho tệp media: tự chọn nơi lưu theo đúng triết lý của tầng dữ liệu.
 *
 *  - Đã cấu hình Supabase  → bucket `vexim-media` (đặt tên qua SUPABASE_MEDIA_BUCKET)
 *  - Chưa / không tới được → thư mục `data/media` (chạy được ngay ở sandbox,
 *    không đẩy tệp lên cloud; thư mục data/ đã nằm trong .gitignore)
 */

export type MediaDriver = "supabase" | "local";

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
    degraded: Boolean(down),
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
  try {
    await fs.rm(path.join(LOCAL_ROOT, safePath(rel)), { force: true });
  } catch {
    /* bỏ qua */
  }
}

/** Lưu một tệp. Tự chuyển sang đĩa nếu Supabase Storage lỗi kết nối. */
export async function putObject(
  rel: string,
  data: Uint8Array,
  contentType: string,
): Promise<{ driver: MediaDriver; path: string }> {
  const clean = safePath(rel);

  if (supabaseUsable()) {
    try {
      const { error } = await getSupabaseClient()!
        .storage.from(mediaBucket())
        .upload(clean, data, { contentType, upsert: true });
      if (error) throw error;
      return { driver: "supabase", path: clean };
    } catch (error) {
      if (!looksLikeConnectionError(error)) throw error;
      markDown(error);
      console.warn("[media] Supabase Storage lỗi kết nối, lưu tạm vào data/media:", error);
    }
  }

  await localPut(clean, data);
  return { driver: "local", path: clean };
}

export async function getObject(
  rel: string,
): Promise<{ data: Uint8Array; driver: MediaDriver } | null> {
  const clean = safePath(rel);

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
      if (!looksLikeConnectionError(error)) throw error;
      markDown(error);
    }
  }

  const local = await localGet(clean);
  return local ? { data: local, driver: "local" } : null;
}

export async function deleteObject(rel: string): Promise<void> {
  const clean = safePath(rel);
  if (supabaseUsable()) {
    try {
      await getSupabaseClient()!.storage.from(mediaBucket()).remove([clean]);
    } catch (error) {
      if (!looksLikeConnectionError(error)) throw error;
      markDown(error);
    }
  }
  await localDelete(clean);
}
