import "server-only";

import { getStore } from "@/lib/db";
import { getSupabaseAuthClient } from "@/lib/db/supabase";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { DataStore } from "@/lib/db/types";
import type { AppUserRecord } from "@/lib/types";

/**
 * Đăng nhập: dùng Supabase Auth khi kết nối được, tự chuyển sang mật khẩu nội bộ
 * khi máy chạy app không tới được Supabase (giống cách tầng dữ liệu tự dự phòng).
 *
 * Chỉ dự phòng khi lỗi là lỗi MẠNG. Nếu Supabase trả lời sai mật khẩu thì từ chối
 * luôn, không thử mật khẩu nội bộ — tránh vòng qua cơ chế bảo vệ của Supabase.
 */

export type LoginResult =
  | { ok: true; user: AppUserRecord; via: "supabase" | "local"; notice?: string }
  | { ok: false; message: string; details?: string[] };

const MISSING_TABLE_HINT =
  "Chưa có bảng app_users trong Supabase. Mở Supabase → SQL Editor, chạy lại toàn bộ " +
  "supabase/schema.sql (mục 5c tạo bảng app_users) rồi đăng nhập lại.";

/**
 * Dịch lỗi thô của Supabase khi ghi/đọc bảng app_users thành hướng dẫn cụ thể.
 * Trả về null khi lỗi không thuộc nhóm đã biết.
 */
export function describeAppUsersError(rawError: string): string | null {
  const text = rawError.toLowerCase();

  if (text.includes("row-level security")) {
    return (
      "Bảng app_users của bạn đang bật Row Level Security. Máy chủ app phải kết nối bằng " +
      "khoá service_role (khoá này bỏ qua RLS) — thêm dòng SUPABASE_SERVICE_ROLE_KEY=... vào " +
      ".env.local rồi khởi động lại app. Không nên tắt RLS vì bảng này chứa mật khẩu đã băm."
    );
  }

  if (text.includes("duplicate key") || text.includes("23505")) {
    return (
      "Email này đã có dòng trong bảng app_users, nhưng máy chủ không đọc được dòng đó — " +
      "thường là do đang dùng khoá anon nên RLS ẩn dữ liệu. Hãy dùng SUPABASE_SERVICE_ROLE_KEY " +
      "trong .env.local rồi khởi động lại app."
    );
  }

  if (text.includes("permission denied")) {
    return (
      "Bị từ chối quyền trên bảng app_users. Dùng khoá service_role trong .env.local, hoặc cấp " +
      "quyền cho bảng này trong Supabase."
    );
  }

  return null;
}

/** Lỗi do chưa chạy schema.sql (bảng/cột app_users chưa tồn tại) */
export function isMissingUsersTable(error: unknown): boolean {
  const text = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  if (!text.includes("app_users")) return false;
  return [
    "does not exist",
    "42p01",
    "schema cache",
    "could not find the table",
    "undefined table",
    "column",
  ].some((needle) => text.includes(needle));
}

/**
 * Người đăng nhập qua Supabase đầu tiên của một hệ thống còn trống sẽ trở thành
 * quản trị viên, để không phải chèn tay vào bảng app_users (giống trang /setup).
 * Mật khẩu vừa được Supabase xác thực cũng được băm scrypt lưu lại làm đường
 * dự phòng khi máy chạy app mất kết nối tới Supabase.
 */
export async function provisionFirstAdmin(
  store: DataStore,
  email: string,
  password: string,
  metadata?: Record<string, unknown> | null,
): Promise<LoginResult> {
  const nameGuess =
    (typeof metadata?.full_name === "string" && metadata.full_name) ||
    (typeof metadata?.name === "string" && metadata.name) ||
    null;

  try {
    const created = await store.createUser({
      email,
      name: nameGuess || null,
      role: "admin",
      auth_provider: "supabase",
      password_hash: await hashPassword(password),
      is_active: true,
    });
    return {
      ok: true,
      user: created,
      via: "supabase",
      notice:
        `Đã khởi tạo tài khoản quản trị đầu tiên cho ${email}. ` +
        "Vào Cài đặt → Người dùng & phân quyền để thêm tài khoản cho nhân viên.",
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (isMissingUsersTable(err)) {
      return { ok: false, message: MISSING_TABLE_HINT, details: ["Lỗi gốc: " + raw] };
    }
    const hint = describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    return {
      ok: false,
      message: "Đăng nhập Supabase thành công nhưng chưa tạo được tài khoản quản trị trong app.",
      details: [raw],
    };
  }
}

function isNetworkError(error: unknown): boolean {
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
  ].some((needle) => text.includes(needle));
}

const WRONG_CREDENTIALS = "Email hoặc mật khẩu không đúng.";

export async function authenticate(email: string, password: string): Promise<LoginResult> {
  const store = getStore();
  const clean = email.trim();
  const client = getSupabaseAuthClient();

  if (client) {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: clean,
        password,
      });

      if (!error && data.user) {
        let record: AppUserRecord | null = null;
        try {
          record = await store.getUserByEmail(clean);
        } catch (err) {
          const raw = err instanceof Error ? err.message : String(err);
          if (isMissingUsersTable(err)) {
            return { ok: false, message: MISSING_TABLE_HINT, details: ["Lỗi gốc: " + raw] };
          }
          const hint = describeAppUsersError(raw);
          if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
          throw err;
        }

        if (!record) {
          // Người đăng nhập Supabase đầu tiên khi hệ thống còn trống → thành quản trị viên.
          let total: number;
          try {
            total = await store.countUsers();
          } catch (err) {
            const raw = err instanceof Error ? err.message : String(err);
            if (isMissingUsersTable(err)) return { ok: false, message: MISSING_TABLE_HINT };
            const hint = describeAppUsersError(raw);
            if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
            throw err;
          }
          if (total === 0) return provisionFirstAdmin(store, clean, password, data.user.user_metadata);
          return {
            ok: false,
            message:
              "Tài khoản Supabase này chưa được cấp quyền trong app. Nhờ quản trị viên thêm trong " +
              "Cài đặt → Người dùng & phân quyền (tài khoản Supabase đầu tiên của hệ thống thì được " +
              "tự động nhận làm quản trị viên).",
          };
        }

        if (!record.is_active) return { ok: false, message: "Tài khoản đã bị tạm khoá." };
        return { ok: true, user: record, via: "supabase" };
      }

      if (error && !isNetworkError(error)) {
        // Supabase trả lời rõ ràng (sai mật khẩu, chưa xác thực email…) → không dự phòng
        const raw = (error as { code?: string; status?: number }).code ?? "";
        if (raw === "email_not_confirmed") {
          return {
            ok: false,
            message: "Email chưa được xác nhận trong Supabase. Xác nhận rồi đăng nhập lại.",
          };
        }
        return { ok: false, message: WRONG_CREDENTIALS };
      }
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      // rơi xuống mật khẩu nội bộ
    }
  }

  let record: AppUserRecord | null;
  try {
    record = await store.getUserByEmail(clean);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    if (isMissingUsersTable(err)) return { ok: false, message: MISSING_TABLE_HINT };
    const hint = describeAppUsersError(raw);
    if (hint) return { ok: false, message: hint, details: ["Lỗi gốc: " + raw] };
    throw err;
  }
  if (!record) return { ok: false, message: WRONG_CREDENTIALS };
  if (!record.is_active) return { ok: false, message: "Tài khoản đã bị tạm khoá." };

  if (!record.password_hash) {
    return {
      ok: false,
      message: `Không kết nối được Supabase, và tài khoản ${clean} chưa có mật khẩu dự phòng. ` +
        "Hãy đăng nhập khi có mạng, hoặc nhờ quản trị viên đặt mật khẩu nội bộ.",
    };
  }

  const valid = await verifyPassword(password, record.password_hash);
  if (!valid) return { ok: false, message: WRONG_CREDENTIALS };

  return {
    ok: true,
    user: record,
    via: "local",
    notice: "Đang đăng nhập bằng mật khẩu nội bộ (chưa kết nối được Supabase).",
  };
}

/**
 * Tạo tài khoản tương ứng bên Supabase Auth (nếu kết nối được).
 * Trả về null khi không tạo được — app vẫn giữ tài khoản nội bộ để dùng offline.
 */
export async function createSupabaseUser(email: string, password: string): Promise<string | null> {
  const client = getSupabaseAuthClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });
    if (error) {
      console.warn("[auth] Không tạo được tài khoản Supabase:", error.message);
      return null;
    }
    return data.user?.id ?? null;
  } catch (err) {
    if (!isNetworkError(err)) {
      console.warn("[auth] Lỗi khi tạo tài khoản Supabase:", err);
    }
    return null;
  }
}

/** Đổi mật khẩu bên Supabase Auth (nếu có tài khoản) */
export async function updateSupabasePassword(email: string, password: string): Promise<boolean> {
  const client = getSupabaseAuthClient();
  if (!client) return false;
  try {
    const { error } = await client.auth.admin.updateUserById(
      await findSupabaseUserId(email).then((id) => id ?? ""),
      { password },
    );
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

async function findSupabaseUserId(email: string): Promise<string | null> {
  const client = getSupabaseAuthClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return null;
    const found = data.users.find(
      (u) => (u.email ?? "").trim().toLowerCase() === email.trim().toLowerCase(),
    );
    return found?.id ?? null;
  } catch {
    return null;
  }
}

/** Supabase Auth có đang dùng được không (để ghi chú trong giao diện) */
export async function supabaseAuthReachable(): Promise<boolean> {
  const client = getSupabaseAuthClient();
  if (!client) return false;
  try {
    const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return isNetworkError(error) ? false : true;
    return true;
  } catch (err) {
    return !isNetworkError(err);
  }
}
