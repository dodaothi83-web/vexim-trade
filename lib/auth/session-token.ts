import "server-only";

import crypto from "node:crypto";

import { getAuthSecret } from "@/lib/auth/secret";
import type { UserRole } from "@/lib/types";

/**
 * Phần THUẦN (pure) của việc ký/xác minh cookie phiên nhân viên — chỉ cần
 * node:crypto + khoá bí mật, KHÔNG đụng tới next/headers hay CSDL.
 *
 * Tách riêng khỏi `lib/auth/session.ts` để middleware.ts có thể xác minh chữ ký
 * cookie (kiểm tra "optimistic": còn hạn + đúng chữ ký) mà không phải kéo theo
 * toàn bộ lib/db (Supabase client, local store...) vào bundle của middleware —
 * middleware chạy trên MỌI request nên càng nhẹ càng tốt.
 *
 * Lưu ý quan trọng về bảo mật: middleware CHỈ dùng kết quả này để chuyển hướng
 * sớm (ví dụ "/" → "/crm/dashboard"). Việc xác thực có thẩm quyền (tài khoản còn
 * active, vai trò chưa đổi, chưa bị khoá...) vẫn do `requireSession()` ở tầng
 * layout /crm đảm nhiệm — nếu cookie còn chữ ký hợp lệ nhưng tài khoản đã bị khoá,
 * /crm/dashboard sẽ tự đá người dùng về /login. Vì vậy middleware "lạc quan"
 * không tạo lỗ hổng, chỉ bớt một vòng tra CSDL không cần thiết trên mỗi request.
 */

export const SESSION_COOKIE = "vxt_session";

export interface SessionUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  via: "supabase" | "local";
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signPayloadB64(payloadB64: string): string {
  return crypto.createHmac("sha256", getAuthSecret()).update(payloadB64).digest("base64url");
}

export function signPayload<T extends object>(payload: T): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${signPayloadB64(body)}`;
}

/** Trả payload nếu chữ ký đúng; KHÔNG kiểm hạn dùng (nơi gọi tự kiểm trường của mình). */
export function readSignedPayload<T extends object>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const a = Buffer.from(mac);
  const b = Buffer.from(signPayloadB64(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function createSessionToken(user: Omit<SessionUser, "exp">, days = 7): string {
  return signPayload<SessionUser>({ ...user, exp: Date.now() + days * 24 * 60 * 60 * 1000 });
}

/** Xác minh "lạc quan": đúng chữ ký + chưa hết hạn. KHÔNG tra CSDL (xem ghi chú ở đầu file). */
export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  const payload = readSignedPayload<SessionUser>(token);
  if (!payload?.uid || !payload?.role || !payload.exp) return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}
