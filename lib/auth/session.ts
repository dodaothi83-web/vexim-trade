import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthSecret } from "@/lib/auth/secret";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import type { UserRole } from "@/lib/types";

/**
 * Phiên đăng nhập: cookie HttpOnly chứa token ký HMAC-SHA256.
 * Token không lưu mật khẩu, chỉ giữ định danh + vai trò + hạn dùng.
 */

export const SESSION_COOKIE = "vxt_session";
const SESSION_DAYS = 7;

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  /** Nguồn xác thực của phiên này: qua Supabase hay mật khẩu nội bộ */
  via: "supabase" | "local";
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest("base64url");
}

export function createSessionToken(user: Omit<SessionUser, "exp">, days = SESSION_DAYS): string {
  const payload: SessionUser = {
    ...user,
    exp: Date.now() + days * 24 * 60 * 60 * 1000,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionUser;
    if (!payload?.uid || !payload?.role || !payload?.exp) return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Đọc phiên hiện tại (null nếu chưa đăng nhập).
 * Token được đối chiếu với bản ghi người dùng trong CSDL để việc khoá tài khoản
 * hoặc đổi vai trò có hiệu lực ngay, không phải chờ cookie hết hạn.
 */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  try {
    const user = await getStore().getUser(payload.uid);
    if (!user || !user.is_active) return null;
    return { ...payload, email: user.email, name: user.name ?? "", role: user.role };
  } catch {
    // Không đọc được CSDL (mất mạng tạm thời): vẫn tin token đã ký để app không sập.
    return payload;
  }
}

/** Ghi cookie phiên — chỉ gọi được trong server action / route handler */
export async function startSession(user: Omit<SessionUser, "exp">): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export interface GateFailure {
  ok: false;
  message: string;
}

/**
 * Cổng kiểm tra quyền cho server actions.
 * Trả về null nếu hợp lệ, hoặc một ActionResult lỗi để action trả thẳng ra.
 */
export async function guard(perm: Permission): Promise<GateFailure | null> {
  const session = await getSession();
  if (!session) {
    return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  }
  if (!hasPermission(session.role, perm)) {
    return { ok: false, message: "Tài khoản của bạn không có quyền thực hiện thao tác này." };
  }
  return null;
}

/** Yêu cầu đăng nhập ở tầng trang; chưa có thì đưa về /login */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * Yêu cầu quyền ở tầng trang: chưa đăng nhập → /login, thiếu quyền → `fallback`.
 * Dùng cho các trang chỉ để ghi dữ liệu (thêm/sửa) để người chỉ xem không mở được form.
 */
export async function requirePagePermission(
  perm: Permission,
  fallback = "/",
): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.role, perm)) redirect(fallback);
  return session;
}

/** Kiểm tra quyền ở tầng trang (dùng cho các trang riêng như Cài đặt) */
export async function requirePermission(perm: Permission): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.role, perm)) return null;
  return session;
}
