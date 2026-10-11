import "server-only";

import { localStore } from "@/lib/db/local";
import {
  getSupabaseClient,
  supabaseConfigured,
  supabaseProjectRef,
  supabaseStore,
  supabaseUrl,
} from "@/lib/db/supabase";
import type { DataStore } from "@/lib/db/types";

/**
 * Tầng dữ liệu của app:
 *
 *  - Chưa điền SUPABASE_URL + key        -> kho local (chế độ demo).
 *  - Đã điền và Supabase trả lời         -> Supabase (dữ liệu thật).
 *  - Đã điền nhưng MÁY CHẠY APP không mở được kết nối tới Supabase
 *    (ví dụ sandbox/preview bị giới hạn internet) -> tạm dùng kho local và
 *    báo rõ trên giao diện qua `dataStatus()`.
 *
 * Việc dự phòng chỉ diễn ra khi lỗi là lỗi mạng/kết nối, và chỉ ở môi trường
 * dev/sandbox. Ở production lỗi vẫn được ném ra như cũ để không âm thầm ghi
 * nhầm chỗ. Điều khiển bằng biến VEXIM_LOCAL_FALLBACK = auto | on | off.
 */

type Mode = "supabase" | "local";

export interface DataStatus {
  /** Nơi dữ liệu đang thực sự được đọc/ghi. */
  mode: Mode;
  /** true khi đã cấu hình Supabase nhưng phải tạm dùng kho local. */
  degraded: boolean;
  /** Lý do mất kết nối (hiển thị ở khối “Kết nối” và trang Cài đặt). */
  reason: string | null;
  /** URL + mã dự án Supabase đang cấu hình. */
  url: string | null;
  projectRef: string | null;
  /** Có cho phép dự phòng local ở môi trường này hay không. */
  fallbackAllowed: boolean;
}

interface DownState {
  at: number;
  reason: string;
}

const globalForDb = globalThis as unknown as {
  __veximSupabaseDown?: DownState | null;
};

/** Sau khoảng này thì thử lại Supabase thay vì dùng kho local. */
const RETRY_AFTER_MS = 60_000;

function flagValue(): string {
  return (process.env.VEXIM_LOCAL_FALLBACK ?? "auto").trim().toLowerCase();
}

export function localFallbackAllowed(): boolean {
  const flag = flagValue();
  if (["0", "off", "false", "no"].includes(flag)) return false;
  if (["1", "on", "true", "yes"].includes(flag)) return true;
  // "auto" (mặc định): bật ở dev/sandbox, tắt ở production
  return (
    process.env.NODE_ENV !== "production" || process.env.E2B_SANDBOX === "true"
  );
}

function errorText(error: unknown): string {
  const e = error as {
    name?: string;
    message?: string;
    cause?: { code?: string; message?: string };
    code?: string;
  } | null;
  return [
    e?.cause?.code,
    e?.code,
    e?.name,
    e?.message,
    e?.cause?.message,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Chỉ dự phòng khi lỗi đúng là lỗi mạng/kết nối, không che lỗi logic SQL. */
function looksLikeConnectionError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
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
    "ssl",
  ].some((needle) => text.includes(needle));
}

function markDown(error: unknown) {
  globalForDb.__veximSupabaseDown = {
    at: Date.now(),
    reason: errorText(error) || "không rõ nguyên nhân",
  };
}

function markedDown(): DownState | null {
  const down = globalForDb.__veximSupabaseDown;
  if (!down) return null;
  if (Date.now() - down.at > RETRY_AFTER_MS) {
    globalForDb.__veximSupabaseDown = null;
    return null;
  }
  return down;
}

/** Cho phép gọi thử lại Supabase ngay (dùng ở trang Cài đặt). */
export function resetSupabaseHealth() {
  globalForDb.__veximSupabaseDown = null;
}

type AnyFn = (...args: unknown[]) => unknown;

/**
 * Bọc Supabase store: nếu gọi thất bại vì lỗi kết nối thì chuyển sang kho local
 * cho lần gọi đó và ghi nhớ trạng thái "đang mất kết nối".
 */
const resilientSupabaseStore: DataStore = new Proxy(supabaseStore, {
  get(target, prop, receiver) {
    const original = Reflect.get(target, prop, receiver) as unknown;
    if (typeof original !== "function") return original;
    const backup = Reflect.get(localStore, prop) as unknown;

    return async (...args: unknown[]) => {
      const canFallback = localFallbackAllowed();
      const useBackup = () => {
        if (typeof backup !== "function") {
          throw new Error(`Không có hàm dự phòng cho "${String(prop)}"`);
        }
        return (backup as AnyFn).apply(localStore, args);
      };

      if (canFallback && markedDown()) return useBackup();

      try {
        return await (original as AnyFn).apply(target, args);
      } catch (error) {
        if (!canFallback || !looksLikeConnectionError(error)) throw error;
        markDown(error);
        return useBackup();
      }
    };
  },
}) as DataStore;

export function getStore(): DataStore {
  if (!supabaseConfigured()) return localStore;
  if (localFallbackAllowed() && markedDown()) return localStore;
  return resilientSupabaseStore;
}

const PROBE_TTL_MS = 10_000;
let probeStartedAt = 0;
let probePromise: Promise<void> | null = null;

async function runProbe(): Promise<void> {
  if (!supabaseConfigured() || !localFallbackAllowed()) return;

  const probed = getSupabaseClient()
    ?.from("suppliers")
    .select("id", { head: true, count: "exact" })
    .limit(1);
  if (!probed) return;

  try {
    const { error } = await probed;
    if (error && looksLikeConnectionError(error)) markDown(error);
  } catch (error) {
    if (looksLikeConnectionError(error)) markDown(error);
  }
}

/**
 * Gọi thử Supabase bằng một truy vấn HEAD rất nhẹ (chỉ `select id`, không lấy
 * dòng nào) để biết ngay có kết nối được hay không, thay vì chờ một truy vấn
 * thật thất bại.
 *
 * Mọi nơi gọi trong cùng 10 giây sẽ nhận CÙNG một promise, nên component chỉ
 * cần `await supabaseProbe()` là chắc chắn đọc được trạng thái đã cập nhật —
 * không phụ thuộc thứ tự render giữa layout và page. Không làm gì ở production
 * (nơi dự phòng bị tắt).
 */
export function supabaseProbe(): Promise<void> {
  const now = Date.now();
  if (!probePromise || now - probeStartedAt > PROBE_TTL_MS) {
    probeStartedAt = now;
    probePromise = runProbe().catch(() => {
      /* lỗi đã được ghi nhận trong runProbe() */
    });
  }
  return probePromise;
}

export function dataMode(): Mode {
  return getStore() === localStore ? "local" : "supabase";
}

export function dataStatus(): DataStatus {
  const configured = supabaseConfigured();
  const fallbackAllowed = localFallbackAllowed();
  const down = fallbackAllowed ? markedDown() : null;

  if (!configured) {
    return {
      mode: "local",
      degraded: false,
      reason: null,
      url: supabaseUrl(),
      projectRef: supabaseProjectRef(),
      fallbackAllowed,
    };
  }

  if (down) {
    return {
      mode: "local",
      degraded: true,
      reason: down.reason,
      url: supabaseUrl(),
      projectRef: supabaseProjectRef(),
      fallbackAllowed,
    };
  }

  return {
    mode: "supabase",
    degraded: false,
    reason: null,
    url: supabaseUrl(),
    projectRef: supabaseProjectRef(),
    fallbackAllowed,
  };
}
