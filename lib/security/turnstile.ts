import "server-only";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "not_configured" | "unavailable" };

/**
 * Công tắc tạm thời: `TURNSTILE_DISABLED=true` tắt TOÀN BỘ kiểm tra Turnstile —
 * widget không render ở mọi form, server không bắt token, kể cả khi đã cấu hình key.
 * Dành cho sự kiện bảo trì/khẩn cấp (vd challenge của Cloudflare bị chặn theo mạng
 * khiến người thật không đăng nhập được). Rate limit và các lớp bảo vệ khác VẪN
 * chạy. Xóa biến (hoặc đặt false) là bật lại ngay — không cần sửa code.
 */
export function isTurnstileDisabled(): boolean {
  return process.env.TURNSTILE_DISABLED?.trim().toLowerCase() === "true";
}

/**
 * Site key cho widget phía client. Null khi chưa cấu hình hoặc khi đang tắt tạm —
 * form khi đó không chặn nút bấm và không hiện vùng kiểm tra.
 */
export function turnstileSiteKey(): string | null {
  if (isTurnstileDisabled()) return null;
  const key = (process.env.TURNSTILE_SITE_KEY ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();
  return key || null;
}

/**
 * Verify a browser token with Cloudflare. Authentication and registration fail
 * closed in production; local development can still run without Turnstile keys.
 * `TURNSTILE_DISABLED=true` is the only production opt-out — an explicit,
 * temporary kill switch that keeps every other protection layer active.
 */
export async function verifyTurnstileToken({
  token,
  remoteIp,
  timeoutMs = 5_000,
}: {
  token: string;
  remoteIp?: string | null;
  timeoutMs?: number;
}): Promise<TurnstileCheck> {
  if (isTurnstileDisabled()) return { ok: true };
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return process.env.NODE_ENV === "production"
    ? { ok: false, reason: "not_configured" }
    : { ok: true };

  const cleanToken = token.trim();
  if (!cleanToken) return { ok: false, reason: "missing" };
  if (cleanToken.length > 4096) return { ok: false, reason: "invalid" };

  try {
    const body = new URLSearchParams({ secret, response: cleanToken });
    const ip = remoteIp?.trim();
    if (ip) body.set("remoteip", ip.slice(0, 100));
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const result = await response.json() as { success?: boolean };
    return result.success === true ? { ok: true } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
