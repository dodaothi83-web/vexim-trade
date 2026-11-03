import { NextResponse } from "next/server";

import { getBuyerSession } from "@/lib/auth/buyer-session";
import { checkAuthRateLimit } from "@/lib/auth/abuse-protection";
import {
  GOOGLE_BUYER_FLOW_COOKIE,
  GOOGLE_FLOW_AGE,
  googleClient,
  googleCookieOptions,
  googleOriginAllowed,
  googleRequestOrigin,
} from "@/lib/auth/google-oauth";
import { safeNextPath } from "@/lib/buyer/next-path";
import { supabaseUrl } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bắt đầu "Continue with Google" cho NGƯỜI MUA.
 *
 * Tách khỏi `/api/auth/google/start` (luồng nhân viên / nhà cung cấp) vì luồng đó chỉ
 * tra bảng `app_users` và sẽ đá người mua về `/login?oauth=not_allowed`. Ở đây lối quay
 * lại là `/buyer/sign-in` và phiên sẽ được cấp bằng cookie `vxt_buyer`.
 *
 * Vẫn dùng Supabase Auth làm nhà cung cấp xác thực: chỉ xin scope `email profile`, và
 * callback sẽ kiểm lại là người dùng Google đã xác minh email.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = googleRequestOrigin(request);
  const next = safeNextPath(url.searchParams.get("next"));
  const retryUrl = (reason: string) => {
    const params = new URLSearchParams({ oauth: reason });
    if (next) params.set("next", next);
    return `/buyer/sign-in?${params.toString()}`;
  };

  if (await getBuyerSession()) return NextResponse.redirect(new URL(next ?? "/", origin));
  // Không bao giờ trả mã OAuth về một origin lấy từ header Host tuỳ ý.
  if (!googleOriginAllowed(origin)) return NextResponse.redirect(new URL(retryUrl("origin"), origin));
  const rate = await checkAuthRateLimit({ flow: "buyer-sign-in", headers: request.headers });
  if (rate.status === "limited") return NextResponse.redirect(new URL(retryUrl("rate_limited"), origin));
  if (rate.status === "degraded") {
    console.warn(`[google-oauth] buyer distribute rate limit ${rate.reason}; local protection remains active`);
  }

  const items: Record<string, string> = {};
  const client = googleClient(items);
  if (!client) return NextResponse.redirect(new URL(retryUrl("unavailable"), origin));
  const callback = new URL("/api/auth/google/buyer/callback", origin).toString();
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback, skipBrowserRedirect: true, scopes: "email profile" },
    });
    const provider = supabaseUrl();
    if (error || !data.url || !provider || new URL(data.url).origin !== new URL(provider).origin) {
      throw error ?? new Error("OAuth URL missing");
    }
    const res = NextResponse.redirect(data.url);
    res.cookies.set(
      GOOGLE_BUYER_FLOW_COOKIE,
      JSON.stringify({ intent: "buyer", items, next }),
      googleCookieOptions(origin.startsWith("https:"), GOOGLE_FLOW_AGE),
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    console.error("[google-oauth] buyer start", error);
    return NextResponse.redirect(new URL(retryUrl("unavailable"), origin));
  }
}
