import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { startBuyerSession } from "@/lib/auth/buyer-session";
import { checkAuthRateLimit } from "@/lib/auth/abuse-protection";
import { googleClient, googleCookieOptions, googleOriginAllowed, googleRequestOrigin, isVerifiedGoogleUser } from "@/lib/auth/google-oauth";
import { googleOneTapClientId, hasOneTapAudience, hasOneTapSession, issueOneTapChallenge, ONE_TAP_AGE, ONE_TAP_COOKIE, readOneTapChallenge } from "@/lib/auth/google-one-tap";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(status: number, ok = false) {
  return NextResponse.json({ ok }, { status, headers: { "Cache-Control": "no-store" } });
}
function sameOrigin(request: Request): boolean {
  const origin = googleRequestOrigin(request);
  return googleOriginAllowed(origin) && request.headers.get("origin") === origin &&
    [null, "same-origin"].includes(request.headers.get("sec-fetch-site"));
}

/** Fetch a short-lived nonce with a same-origin PUT, not a cross-site navigation. */
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return reply(403);
  const clientId = googleOneTapClientId();
  if (!clientId || await hasOneTapSession()) return reply(409);
  const rate = await checkAuthRateLimit({ flow: "buyer-sign-in", headers: request.headers });
  if (rate.status === "limited") return reply(429);
  const challenge = issueOneTapChallenge(clientId);
  const response = NextResponse.json({ nonce: challenge.nonce }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ONE_TAP_COOKIE, challenge.cookie, googleCookieOptions(googleRequestOrigin(request).startsWith("https:"), ONE_TAP_AGE));
  return response;
}

async function readCredential(request: Request): Promise<string | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 16_384) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof data.credential === "string" && data.credential.length > 0 && data.credential.length <= 12_000 ? data.credential : null;
  } catch { return null; }
}

/** Google ID tokens are verified by Supabase, never trusted from decoded browser claims. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply(403);
  const clientId = googleOneTapClientId();
  if (!clientId || await hasOneTapSession()) return reply(409);
  const rate = await checkAuthRateLimit({ flow: "buyer-sign-in", headers: request.headers });
  if (rate.status === "limited") return reply(429);
  const flow = readOneTapChallenge((await cookies()).get(ONE_TAP_COOKIE)?.value, clientId);
  const credential = await readCredential(request);
  const finish = (status: number, ok = false) => {
    const response = reply(status, ok);
    response.cookies.set(ONE_TAP_COOKIE, "", googleCookieOptions(googleRequestOrigin(request).startsWith("https:"), 0));
    return response;
  };
  if (!flow || !credential || !hasOneTapAudience(credential, clientId)) return finish(400);
  const client = googleClient({});
  if (!client) return finish(503);
  try {
    const { data, error } = await client.auth.signInWithIdToken({ provider: "google", token: credential, nonce: flow.nonce });
    if (error || !isVerifiedGoogleUser(data.user)) return finish(401);
    const store = getStore();
    if (store.mode !== "supabase") return finish(503);
    const email = data.user.email.trim().toLowerCase();
    let account = await store.getBuyerUserByEmail(email);
    if (!account) {
      const knownBuyer = await store.getBuyerByEmail(email).catch(() => null);
      try {
        account = await store.createBuyerUser({ email, company_name: knownBuyer?.company?.trim() || null,
          verified_at: new Date().toISOString(), last_seen_at: new Date().toISOString() });
      } catch {
        // Another tab may have created the same account. Never create an internal user.
        account = await store.getBuyerUserByEmail(email);
        if (!account) return finish(503);
      }
    }
    if (!account.verified_at) account = await store.updateBuyerUser(account.id, { verified_at: new Date().toISOString() });
    await store.updateBuyerUser(account.id, { last_seen_at: new Date().toISOString() }).catch(() => null);
    await startBuyerSession({ uid: account.id, email: account.email });
    return finish(200, true);
  } catch {
    // Never log credentials, provider responses, access tokens or profile data.
    return finish(503);
  }
}
