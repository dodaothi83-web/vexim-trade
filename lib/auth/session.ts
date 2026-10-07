import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthSecret } from "@/lib/auth/secret";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import { describeAppUsersError, isMissingUsersTable } from "@/lib/auth/authenticate";
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
 * Vì sao cookie hợp lệ nhưng không dựng lại được phiên.
 * Dùng để đưa người dùng tới /login kèm lời giải thích thay vì vòng lặp khó hiểu.
 */
export type SessionMiss = "not_found" | "locked" | "unreadable";

export interface SessionLookup {
  session: SessionUser | null;
  /** Chỉ khác null khi cookie hợp lệ nhưng không dựng lại được phiên */
  miss: SessionMiss | null;
}

/**
 * Đọc phiên hiện tại.
 * Token được đối chiếu với bản ghi người dùng trong CSDL để việc khoá tài khoản
 * hoặc đổi vai trò có hiệu lực ngay, không phải chờ cookie hết hạn.
 *
 * Lưu ý: nếu máy chủ dùng khoá Supabase bị RLS chặn (ví dụ khoá anon trên bảng
 * app_users bật RLS), truy vấn trả về RỖNG chứ không báo lỗi — trước đây app coi
 * đó là "hết phiên" nên đá người dùng về /login ở mọi cú nhấp. Giờ phân biệt rõ
 * để báo đúng nguyên nhân, và tự gắn lại phiên theo email khi id bản ghi đã đổi.
 */
export async function lookupSession(): Promise<SessionLookup> {
  const store = await cookies();
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return { session: null, miss: null };

  const db = getStore();
  try {
    let user = await db.getUser(payload.uid);
    // Bản ghi có thể đã đổi id (ví dụ gắn lại với UID của Supabase Auth) → tìm theo email
    if (!user && payload.email) user = await db.getUserByEmail(payload.email);
    if (!user) return { session: null, miss: "not_found" };
    if (!user.is_active) return { session: null, miss: "locked" };
    return {
      session: { ...payload, uid: user.id, email: user.email, name: user.name ?? "", role: user.role },
      miss: null,
    };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    // Lỗi quyền/RLS trên bảng app_users: không thể xác minh phiên → báo rõ
    if (describeAppUsersError(text) || isMissingUsersTable(err)) {
      return { session: null, miss: "unreadable" };
    }
    // Lỗi khác (mất mạng tạm thời): vẫn tin token đã ký để app không sập.
    return { session: payload, miss: null };
  }
}

/** Đọc phiên hiện tại (null nếu chưa đăng nhập) */
export async function getSession(): Promise<SessionUser | null> {
  return (await lookupSession()).session;
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

/** Yêu cầu đăng nhập ở tầng trang; chưa có thì đưa về /login kèm lý do cụ thể */
export async function requireSession(): Promise<SessionUser> {
  const { session, miss } = await lookupSession();
  if (!session) redirect(miss ? `/login?reason=${miss}` : "/login");
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
  const { session, miss } = await lookupSession();
  if (!session) redirect(miss ? `/login?reason=${miss}` : "/login");
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
