/**
 * Middleware — thêm X-Robots-Tag:
 *
 *  - noindex toàn site khi PUBLIC_SITE_INDEXABLE !== "true" (mặc định đến khi có ≥10 NCC published).
 *  - Luôn noindex /rfq*, /rfq/status/*, /compare?*, /login, /auth/*, /crm/* (back-office).
 *
 * Không can thiệp vào API hay static assets.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const INDEXABLE = process.env.PUBLIC_SITE_INDEXABLE === "true";

// Các prefix LUÔN noindex dù site-wide cờ đang bật.
const ALWAYS_NOINDEX_PREFIXES = [
  "/rfq",
  "/compare",
  "/login",
  "/auth",
  "/crm", // back-office CRM
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
  const res = NextResponse.next();
  const { pathname } = req.nextUrl;

  const noindex = !INDEXABLE || isAlwaysNoIndex(pathname);
  if (noindex) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: [
    // Bỏ static assets và file công cộng
    "/((?!_next/static|_next/image|favicon\\.ico|images/|logo-vexim\\.png|linkedin\\.png|facebook\\.png|email-logo\\.png|cashew/).*)",
  ],
};
