import "server-only";

import { getStore } from "@/lib/db";
import { getSupabaseClient } from "@/lib/db/supabase";
import { verifyPassword } from "@/lib/auth/password";
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
  | { ok: false; message: string };

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
  const client = getSupabaseClient();

  if (client) {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: clean,
        password,
      });

      if (!error && data.user) {
        const record = await store.getUserByEmail(clean);
        if (!record) {
          return {
            ok: false,
            message:
              "Tài khoản Supabase này chưa được cấp quyền trong app. Nhờ quản trị viên thêm trong Cài đặt → Người dùng.",
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

  const record = await store.getUserByEmail(clean);
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
  const client = getSupabaseClient();
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
  const client = getSupabaseClient();
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
  const client = getSupabaseClient();
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
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return isNetworkError(error) ? false : true;
    return true;
  } catch (err) {
    return !isNetworkError(err);
  }
}
