import "server-only";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "not_configured" | "unavailable" };

/**
 * Verify a browser token with Cloudflare. Authentication and registration fail
 * closed in production; local development can still run without Turnstile keys.
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
