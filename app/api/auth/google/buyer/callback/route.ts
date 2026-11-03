import { NextResponse } from "next/server";

import { startBuyerSession } from "@/lib/auth/buyer-session";
import {
  GOOGLE_BUYER_FLOW_COOKIE,
  googleClient,
  googleCookieOptions,
  googleOriginAllowed,
  googleRequestOrigin,
  isVerifiedGoogleUser,
  parseGoogleFlow,
} from "@/lib/auth/google-oauth";
import { safeNextPath } from "@/lib/buyer/next-path";
import { getStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Callback của Google cho người mua.
 *
 * Đăng nhập và đăng ký là CÙNG một bước, đúng như luồng email + mã 6 số: email Google đã
 * xác minh mà chưa có tài khoản người mua thì tạo luôn, `verified_at` đóng dấu ngay vì
 * Google đã xác minh hộ. Tên công ty vẫn để trống và hỏi sau.
 *
 * Đây KHÔNG cấp quyền nội bộ: không tạo `app_users`, không đặt `role`, cookie là `vxt_buyer`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = googleRequestOrigin(request);
  const target = (path: string) => NextResponse.redirect(new URL(path, origin));
  const clear = (res: NextResponse) => {
    res.cookies.set(GOOGLE_BUYER_FLOW_COOKIE, "", googleCookieOptions(origin.startsWith("https:"), 0));
    res.headers.set("Cache-Control", "no-store");
    return res;
  };

  if (!googleOriginAllowed(origin)) return clear(target("/buyer/sign-in?oauth=origin"));

  const { cookies } = await import("next/headers");
  const flow = parseGoogleFlow((await cookies()).get(GOOGLE_BUYER_FLOW_COOKIE)?.value);
  // Chỉ chấp nhận phiên do chính route start của người mua tạo; phiên của nhà cung cấp
  // lọt vào đây thì bỏ, không tự nâng thành phiên người mua.
  if (flow?.intent !== "buyer") return clear(target("/buyer/sign-in?oauth=cancelled"));

  const next = safeNextPath(flow.next);
  const retryUrl = (reason: string) => {
    const params = new URLSearchParams({ oauth: reason });
    if (next) params.set("next", next);
    return `/buyer/sign-in?${params.toString()}`;
  };

  const code = url.searchParams.get("code");
  if (!code || code.length > 2048 || url.searchParams.has("error")) return clear(target(retryUrl("cancelled")));

  const client = googleClient(flow.items);
  if (!client) return clear(target(retryUrl("unavailable")));

  try {
    // PKCE chứng minh callback thuộc đúng trình duyệt đã bắt đầu luồng; mã chỉ dùng một lần.
    const flowId = url.searchParams.get("sb_flow_id") ?? undefined;
    const { data, error } = await client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error || !isVerifiedGoogleUser(data.user)) return clear(target(retryUrl("unverified")));

    const store = getStore();
    if (store.mode !== "supabase") return clear(target(retryUrl("unavailable")));

    const email = data.user.email.trim().toLowerCase();
    let account = await store.getBuyerUserByEmail(email);
    if (!account) {
      // Điền sẵn tên công ty nếu người này đã từng gửi yêu cầu báo giá.
      const knownBuyer = await store.getBuyerByEmail(email).catch(() => null);
      account = await store.createBuyerUser({
        email,
        company_name: knownBuyer?.company?.trim() || null,
        verified_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });
    } else if (!account.verified_at) {
      account = await store.updateBuyerUser(account.id, { verified_at: new Date().toISOString() });
    }
    await store.updateBuyerUser(account.id, { last_seen_at: new Date().toISOString() }).catch(() => null);

    await startBuyerSession({ uid: account.id, email: account.email });
    return clear(target(next ?? "/"));
  } catch (error) {
    console.error("[google-oauth] buyer callback", error);
    return clear(target(retryUrl("failed")));
  }
}
