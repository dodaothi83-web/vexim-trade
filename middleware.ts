/**
 * Middleware — thêm X-Robots-Tag, và chuyển hướng sớm cho trang chủ:
 *
 *  - noindex site khi PUBLIC_SITE_INDEXABLE !== "true" (trừ legal URLs để Google OAuth đọc được).
 *  - Luôn noindex /rfq*, /rfq/status/*, /compare?*, /login, /auth/*, /crm/* (back-office).
 *  - "/" với cookie phiên nhân viên hợp lệ → /crm/dashboard; "/" trên host nội bộ
 *    (crm.*, *.vercel.app) → /login. Trước đây hai việc này nằm trong
 *    app/(public)/page.tsx và buộc cả trang phải render động (force-dynamic) mỗi
 *    request dù chỉ phục vụ rất ít request thật sự cần redirect. Chuyển lên đây để
 *    trang chủ có thể render tĩnh/ISR cho số đông người mua, trong khi nhân viên vẫn
 *    được đẩy đi đúng chỗ TRƯỚC khi chạm vào bất kỳ cache nào.
 *
 *    Đây là kiểm tra "lạc quan": chỉ xác minh chữ ký + hạn dùng cookie
 *    (verifySessionToken), KHÔNG tra CSDL để biết tài khoản có bị khoá hay đổi vai
 *    trò hay không — làm vậy trên middleware (chạy mọi request) sẽ chậm hơn chính
 *    vấn đề đang muốn sửa. /crm/dashboard (qua requireSession() ở app/crm/layout.tsx)
 *    vẫn luôn tra CSDL đầy đủ và tự đá về /login nếu phiên không còn hợp lệ, nên
 *    không phát sinh lỗ hổng — chỉ là một bước chuyển hướng sớm, có thể "lạc quan sai"
 *    theo hướng an toàn (thừa một vòng chuyển hướng, không thiếu một lớp kiểm tra).
 *
 * Không can thiệp vào API hay static assets.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session-token";

// Cookie phiên dùng HMAC (node:crypto) qua getAuthSecret() (có thể đọc file khoá
// trên đĩa) — cần Node.js runtime, không chạy được trên Edge runtime mặc định.
export const runtime = "nodejs";

const NON_PRODUCTION = ["preview", "development"].includes(process.env.VERCEL_ENV ?? "") || process.env.VEXIM_DEPLOY_ENV === "staging";
const INDEXABLE = !NON_PRODUCTION && process.env.PUBLIC_SITE_INDEXABLE === "true";
// OAuth verification must reach these public policies even before marketing pages are indexable.
const LEGAL_PATHS = new Set(["/privacy-policy", "/terms-of-service", "/thong-tin-chu-quan", "/quy-che-hoat-dong", "/dieu-khoan-su-dung", "/chinh-sach-bao-mat", "/khieu-nai"]);
const LEGAL_CRAWLABLE = !NON_PRODUCTION;

// Các prefix LUÔN noindex dù site-wide cờ đang bật.
const ALWAYS_NOINDEX_PREFIXES = [
  "/rfq",
  "/compare",
  "/login",
  "/sign-in",
  "/auth",
  // Đăng nhập người mua và trang riêng của họ: không có gì để Google đọc.
  "/buyer",
  "/my",
  "/crm", // back-office CRM
  "/supplier", // đăng ký và cổng NCC không được index
  "/verify", // trang xác thực mã báo cáo xác minh nhà máy
  "/api",
  "/_next",
];

function isAlwaysNoIndex(pathname: string): boolean {
  for (const p of ALWAYS_NOINDEX_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return true;
  }
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Giữ đúng phạm vi cũ: chỉ trang chủ "/" từng có hai chuyển hướng này
  // (app/(public)/page.tsx), các trang công khai khác không bị ảnh hưởng.
  if (pathname === "/") {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (verifySessionToken(token)) {
      return NextResponse.redirect(new URL("/crm/dashboard", req.url));
    }
    const host = (req.headers.get("host") ?? "").toLowerCase();
    if (host.startsWith("crm.") || host.endsWith(".vercel.app")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Root layout đọc x-pathname để đặt <html lang> đúng khu vực (EN công khai / VI nội bộ).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });

  const noindex = !(LEGAL_CRAWLABLE && LEGAL_PATHS.has(pathname)) && (!INDEXABLE || isAlwaysNoIndex(pathname));
  if (noindex) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: [
    // Bỏ static assets và file công cộng
    "/((?!_next/static|_next/image|favicon\\.(?:ico|png)|apple-touch-icon\\.png|images/|logo-vexim(?:-white-mark)?\\.png|linkedin\\.png|facebook\\.png|email-logo\\.png|cashew/).*)",
  ],
};
