import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { readSignedPayload, signPayload, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { getBuyerSession } from "@/lib/auth/buyer-session";

export const ONE_TAP_COOKIE = "vxt_google_buyer_nonce";
export const ONE_TAP_AGE = 300;
type Challenge = { purpose: "buyer-google-one-tap"; nonce: string; clientId: string; exp: number };

/** Opt-in only. This is a public OAuth client ID, never a client secret. */
export function googleOneTapClientId(): string | null {
  const id = process.env.GOOGLE_ONE_TAP_CLIENT_ID?.trim();
  return process.env.GOOGLE_ONE_TAP_ENABLED === "true" && id && /^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id) ? id : null;
}

/** A signed internal session suppresses buyer invitations without a database lookup. */
export async function hasOneTapSession(): Promise<boolean> {
  return Boolean(await getBuyerSession()) || Boolean(verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value));
}

export function issueOneTapChallenge(clientId: string) {
  const nonce = crypto.randomBytes(32).toString("hex");
  const payload: Challenge = { purpose: "buyer-google-one-tap", nonce, clientId, exp: Date.now() + ONE_TAP_AGE * 1000 };
  return { cookie: signPayload(payload), nonce: crypto.createHash("sha256").update(nonce).digest("hex") };
}

export function readOneTapChallenge(raw: string | undefined, clientId: string): Challenge | null {
  if (!raw || raw.length > 1500) return null;
  const value = readSignedPayload<Challenge>(raw);
  return value?.purpose === "buyer-google-one-tap" && value.clientId === clientId &&
    typeof value.exp === "number" && value.exp > Date.now() &&
    typeof value.nonce === "string" && /^[a-f0-9]{64}$/.test(value.nonce) ? value : null;
}

/** Only a prefilter. Supabase Auth must still verify signature, issuer, expiry and nonce. */
export function hasOneTapAudience(token: string, clientId: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims.aud === clientId;
  } catch { return false; }
}
