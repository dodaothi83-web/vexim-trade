import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { GOOGLE_FLOW_COOKIE, GOOGLE_SIGNUP_COOKIE, GOOGLE_SIGNUP_AGE, googleClient, googleCookieOptions, isVerifiedGoogleUser, issueGoogleSignupTicket, parseGoogleFlow, googleRequestOrigin, googleOriginAllowed } from "@/lib/auth/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = googleRequestOrigin(request);
  const target = (path: string) => NextResponse.redirect(new URL(path, origin));
  const clear = (res: NextResponse) => { res.cookies.set(GOOGLE_FLOW_COOKIE, "", googleCookieOptions(origin.startsWith("https:"), 0)); res.headers.set("Cache-Control", "no-store"); return res; };
  if (!googleOriginAllowed(origin)) return clear(target("/login?oauth=origin"));
  const { cookies } = await import("next/headers");
  const flow = parseGoogleFlow((await cookies()).get(GOOGLE_FLOW_COOKIE)?.value);
  const code = url.searchParams.get("code");
  if (!flow || !code || code.length > 2048 || url.searchParams.has("error")) return clear(target("/login?oauth=cancelled"));
  const client = googleClient(flow.items);
  if (!client) return clear(target("/login?oauth=unavailable"));
  try {
    // PKCE proves the callback belongs to the browser that started this flow; code is single-use.
    const flowId = url.searchParams.get("sb_flow_id") ?? undefined;
    const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error || !isVerifiedGoogleUser(data.user)) return clear(target("/login?oauth=unverified"));
    const google = data.user;
    const store = getStore();
    if (store.mode !== "supabase") return clear(target("/login?oauth=unavailable"));
    const user = await store.getUserByEmail(google.email);
    if (flow.intent === "signup") {
      if (user) return clear(target("/login?oauth=existing"));
      const res = clear(target("/supplier/apply"));
      res.cookies.set(GOOGLE_SIGNUP_COOKIE, issueGoogleSignupTicket(google.id, google.email), googleCookieOptions(origin.startsWith("https:"), GOOGLE_SIGNUP_AGE));
      return res;
    }
    // Google authentication is not an invitation, and never creates a CRM/supplier role.
    if (!user || !user.is_active || (user.role === "supplier" && !user.supplier_id)) return clear(target("/login?oauth=not_allowed"));
    const res = clear(target(user.role === "supplier" ? "/supplier/portal" : "/crm/dashboard"));
    res.cookies.set(SESSION_COOKIE, createSessionToken({ uid: user.id, email: user.email,
      name: user.name ?? user.email, role: user.role, via: "supabase" }),
      { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/", maxAge: 7 * 24 * 60 * 60 });
    await store.touchUserLogin(user.id).catch(() => null);
    revalidatePath("/", "layout");
    return res;
  } catch (error) {
    console.error("[google-oauth] callback", error);
    return clear(target("/login?oauth=failed"));
  }
}
