/**
 * Middleware — thêm X-Robots-Tag:
 *
 *  - noindex site khi PUBLIC_SITE_INDEXABLE !== "true" (trừ legal URLs để Google OAuth đọc được).
 *  - Luôn noindex /rfq*, /rfq/status/*, /compare?*, /login, /auth/*, /crm/* (back-office).
 *
 * Không can thiệp vào API hay static assets.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INDEXABLE = process.env.PUBLIC_SITE_INDEXABLE === "true";
// OAuth verification must reach these public policies even before marketing pages are indexable.
const LEGAL_PATHS = new Set(["/privacy-policy", "/terms-of-service", "/thong-tin-chu-quan", "/quy-che-hoat-dong", "/dieu-khoan-su-dung", "/chinh-sach-bao-mat", "/khieu-nai"]);
const LEGAL_CRAWLABLE = !["preview", "development"].includes(process.env.VERCEL_ENV ?? "");

// Các prefix LUÔN noindex dù site-wide cờ đang bật.
const ALWAYS_NOINDEX_PREFIXES = [
  "/rfq",
  "/compare",
  "/login",
  "/auth",
  "/crm", // back-office CRM
  "/supplier", // đăng ký và cổng NCC không được index
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
    "/((?!_next/static|_next/image|favicon\\.(?:ico|png)|images/|logo-vexim(?:-white-mark)?\\.png|linkedin\\.png|facebook\\.png|email-logo\\.png|cashew/).*)",
  ],
};
