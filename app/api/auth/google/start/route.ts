import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { GOOGLE_FLOW_AGE, GOOGLE_FLOW_COOKIE, googleClient, googleCookieOptions, googleRequestOrigin, googleOriginAllowed } from "@/lib/auth/google-oauth";
import { supabaseUrl } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = googleRequestOrigin(request);
  const intent = url.searchParams.get("intent");
  if (intent !== "signup" && intent !== "login") return NextResponse.redirect(new URL("/login?oauth=invalid", origin));
  const session = await getSession();
  if (session) return NextResponse.redirect(new URL(session.role === "supplier" ? "/supplier/portal" : "/crm/dashboard", origin));
  // Never hand an OAuth code back to an origin supplied by an arbitrary Host header.
  if (!googleOriginAllowed(origin)) return NextResponse.redirect(new URL("/login?oauth=origin", origin));
  const items: Record<string, string> = {};
  const client = googleClient(items);
  if (!client) return NextResponse.redirect(new URL("/login?oauth=unavailable", origin));
  const callback = new URL("/api/auth/google/callback", origin).toString();
  try {
    const { data, error } = await client.auth.signInWithOAuth({ provider: "google",
      options: { redirectTo: callback, skipBrowserRedirect: true, scopes: "email profile" } });
    const provider = supabaseUrl();
    if (error || !data.url || !provider || new URL(data.url).origin !== new URL(provider).origin) throw error ?? new Error("OAuth URL missing");
    const res = NextResponse.redirect(data.url);
    res.cookies.set(GOOGLE_FLOW_COOKIE, JSON.stringify({ intent, items }), googleCookieOptions(origin.startsWith("https:"), GOOGLE_FLOW_AGE));
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("[google-oauth] start", error);
    return NextResponse.redirect(new URL("/login?oauth=unavailable", origin));
  }
}
