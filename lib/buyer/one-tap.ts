/** UI-only policy. Server independently checks session, origin, nonce and Google identity. */
export const ONE_TAP_DISMISS_KEY = "vxt_buyer_google_prompt_after";
export const ONE_TAP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function oneTapPublicPath(path: string): boolean {
  return !/^\/(?:buyer|login|sign-in|register|supplier|crm|auth|api)(?:\/|$)/.test(path);
}

export function oneTapCooldownActive(raw: string | null, now = Date.now()): boolean {
  const until = Number(raw);
  return Number.isFinite(until) && until > now;
}
