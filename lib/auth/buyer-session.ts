import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { cookieSecure, readSignedPayload, signPayload } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import type { BuyerUser } from "@/lib/types";

/**
 * Phiên của NGƯỜI MUA — cookie riêng, không dùng chung với phiên nhân viên.
 *
 * Vì sao phải tách:
 *
 *  - `lookupSession()` (phiên nhân viên) đối chiếu cookie với bảng `app_users` và trả
 *    `miss: "not_found"` khi không thấy. Nhét người mua vào cùng cookie nghĩa là mỗi lần
 *    tải trang hệ thống lại coi họ là "phiên hỏng" và đá về `/login`.
 *  - `guard()` / `requireSession()` đang bảo vệ CRM và cổng nhà cung cấp. Thêm một nhánh
 *    người mua vào đúng hai hàm đó là đụng vào chỗ phân quyền nhạy cảm nhất của hệ thống.
 *
 * Payload KHÔNG có `role`: người mua không có vai trò nội bộ, nên không thể vô tình được
 * `hasPermission()` xét như nhân viên.
 */

export const BUYER_SESSION_COOKIE = "vxt_buyer";

/** 30 ngày, trượt hạn mỗi lần dùng (xem `touchBuyerSession`). */
const BUYER_SESSION_DAYS = 30;

export interface BuyerSession {
  uid: string;
  email: string;
  exp: number;
}

export function createBuyerSessionToken(input: { uid: string; email: string }, days = BUYER_SESSION_DAYS): string {
  return signPayload<BuyerSession>({
    uid: input.uid,
    email: input.email.trim().toLowerCase(),
    exp: Date.now() + days * 24 * 60 * 60 * 1000,
  });
}

export function verifyBuyerSessionToken(token: string | undefined | null): BuyerSession | null {
  const payload = readSignedPayload<BuyerSession>(token);
  if (!payload?.uid || !payload.email || !payload.exp) return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}

/** Ghi cookie người mua — chỉ gọi được trong server action / route handler. */
export async function startBuyerSession(input: { uid: string; email: string }): Promise<void> {
  const store = await cookies();
  store.set(BUYER_SESSION_COOKIE, createBuyerSessionToken(input), {
    httpOnly: true,
    sameSite: "lax",
    secure: await cookieSecure(),
    path: "/",
    maxAge: BUYER_SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endBuyerSession(): Promise<void> {
  const store = await cookies();
  // Phải đặt cùng cờ Secure, nếu không trình duyệt sẽ từ chối ghi đè cookie cũ.
  store.set(BUYER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: await cookieSecure(),
    path: "/",
    maxAge: 0,
  });
}

/** Phiên hợp lệ theo chữ ký + hạn dùng. KHÔNG chạm cơ sở dữ liệu. */
export async function getBuyerSession(): Promise<BuyerSession | null> {
  const store = await cookies();
  return verifyBuyerSessionToken(store.get(BUYER_SESSION_COOKIE)?.value);
}

/**
 * Tài khoản đang đăng nhập, đọc từ cơ sở dữ liệu.
 *
 * Chỉ dùng ở nơi cần dữ liệu tài khoản (tên công ty, danh sách đã lưu, tuỳ chọn email).
 * Kiểm quyền gửi yêu cầu chỉ cần `getBuyerSession()` — một lần đọc cookie, không truy vấn.
 */
export async function getBuyerUser(): Promise<BuyerUser | null> {
  const session = await getBuyerSession();
  if (!session) return null;
  const store = getStore();
  const account = await store.getBuyerUser(session.uid).catch(() => null);
  if (account) return account;
  // Id đã đổi (ví dụ tài khoản bị tạo lại cùng email) → bám theo email như phiên nhân viên.
  return store.getBuyerUserByEmail(session.email).catch(() => null);
}

/** Chưa đăng nhập thì đưa về trang đăng nhập, giữ nguyên đích quay lại. */
export async function requireBuyerSession(nextPath?: string): Promise<BuyerSession> {
  const session = await getBuyerSession();
  if (!session) {
    const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/buyer/sign-in${next}`);
  }
  return session;
}
