import "server-only";

import crypto from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { getAuthSecret } from "@/lib/auth/secret";
import { supabaseUrl } from "@/lib/db/supabase";
import { SITE_URL } from "@/lib/site";

export const GOOGLE_FLOW_COOKIE = "vxt_google_flow";
export const GOOGLE_SIGNUP_COOKIE = "vxt_google_signup";
export const GOOGLE_FLOW_AGE = 600;
export const GOOGLE_SIGNUP_AGE = 1800;

type Flow = { intent: "login" | "signup"; items: Record<string, string> };
type Ticket = { id: string; email: string; exp: number };

export function isVerifiedGoogleUser(user: User | null | undefined): user is User & { email: string } {
  return !!user?.id && !!user.email && !!user.email_confirmed_at &&
    !!user.identities?.some((identity) => identity.provider === "google" &&
      identity.identity_data?.email_verified === true &&
      typeof identity.identity_data.email === "string" &&
      identity.identity_data.email.toLowerCase() === user.email?.toLowerCase());
}

/** The OAuth client is request-scoped. Never persist an access token in a browser or in the global service-role client. */
export function googleClient(items: Record<string, string>) {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(url, key, { auth: {
    // Supabase only honors a custom PKCE storage adapter with persistSession=true.
    // This is a NEW in-memory map per request; only the pre-exchange verifier is ever put in a cookie.
    flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    storage: {
      getItem: (key) => items[key] ?? null,
      setItem: (key, value) => { items[key] = value; },
      removeItem: (key) => { delete items[key]; },
    },
  } });
}

export function parseGoogleFlow(raw: string | undefined): Flow | null {
  try {
    if (!raw || raw.length > 6000) return null;
    const parsed = JSON.parse(raw) as Flow;
    if (parsed.intent !== "login" && parsed.intent !== "signup") return null;
    if (!parsed.items || typeof parsed.items !== "object" || Object.keys(parsed.items).length > 8 ||
        !Object.entries(parsed.items).every(([key, val]) => key.length < 180 && typeof val === "string" && val.length < 1200)) return null;
    return parsed;
  } catch { return null; }
}

export function issueGoogleSignupTicket(id: string, email: string): string {
  const body = Buffer.from(JSON.stringify({ id, email: email.toLowerCase(), exp: Date.now() + GOOGLE_SIGNUP_AGE * 1000 } satisfies Ticket)).toString("base64url");
  const mac = crypto.createHmac("sha256", getAuthSecret()).update(`google-signup:${body}`).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyGoogleSignupTicket(raw: string | undefined): Ticket | null {
  if (!raw || raw.length > 2048) return null;
  const [body, mac, extra] = raw.split(".");
  if (!body || !mac || extra) return null;
  const expected = crypto.createHmac("sha256", getAuthSecret()).update(`google-signup:${body}`).digest();
  let actual: Buffer;
  try { actual = Buffer.from(mac, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Ticket;
    return typeof ticket.id === "string" && typeof ticket.email === "string" &&
      typeof ticket.exp === "number" && ticket.exp > Date.now() ? ticket : null;
  } catch { return null; }
}

export function googleOriginAllowed(origin: string): boolean {
  return [SITE_URL, process.env.APP_URL, process.env.GOOGLE_OAUTH_SITE_URL].some((candidate) => {
    if (!candidate) return false;
    try {
      const parsed = new URL(candidate);
      return (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) && parsed.origin === origin;
    } catch { return false; }
  });
}

export function googleRequestOrigin(request: Request): string {
  const fallback = new URL(request.url).origin;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")).split(",")[0].trim();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host) || !/^(https|http)$/.test(proto)) return fallback;
  return `${proto}://${host}`;
}

export const googleCookieOptions = (secure: boolean, age: number) => ({
  httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: age,
});
