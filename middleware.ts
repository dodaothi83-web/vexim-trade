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
 *    (verifySessionTokenEdge), KHÔNG tra CSDL để biết tài khoản có bị khoá hay đổi vai
 *    trò hay không — làm vậy trên middleware (chạy mọi request) sẽ chậm hơn chính
 *    vấn đề đang muốn sửa. /crm/dashboard (qua requireSession() ở app/crm/layout.tsx)
 *    vẫn luôn tra CSDL đầy đủ và tự đá về /login nếu phiên không còn hợp lệ, nên
 *    không phát sinh lỗ hổng — chỉ là một bước chuyển hướng sớm, có thể "lạc quan sai"
 *    theo hướng an toàn (thừa một vòng chuyển hướng, không thiếu một lớp kiểm tra).
 *
 *  - Trang chi tiết sản phẩm /products/<slug>/<id> cũng là bản dựng sẵn (ISR). Người có
 *    cookie phiên hợp lệ (nhân viên / nhà cung cấp) được viết lại — URL giữ nguyên — sang bản
 *    động /staff-product-view/<slug>/<id> (xem trước danh mục chưa công khai, không đếm lượt
 *    xem của chính mình). Cùng kiểu kiểm tra "lạc quan" như trên: trang động vẫn tự tra phiên
 *    đầy đủ bằng getSession(), cookie sai chỉ nhận đúng bản công khai.
 *
 *  - Trang danh mục /products/<slug> (không ?cert=, không ?page= > 1): khách được viết lại — URL
 *    giữ nguyên — sang bản dựng sẵn /products/category-render/<lang>/<slug>. Người có cookie phiên
 *    hợp lệ giữ bản động (xem trước danh mục nháp). Xem lib/public/category-route.ts.
 *
 * Không can thiệp vào API hay static assets.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifySessionTokenEdge } from "@/lib/auth/session-token-edge";
import { homeRenderPath, publicHomeUrlFor } from "@/lib/public/home-route";
import { publicProductUrlFor, staffProductViewPath } from "@/lib/public/product-route";
import { categoryRenderTarget, publicCategoryUrlFor } from "@/lib/public/category-route";

// Edge runtime (mặc định của middleware.ts): chạy ở điểm CDN gần người dùng. Trước đây
// file này đặt runtime = "nodejs" chỉ để xác minh cookie bằng node:crypto — middleware Node
// chạy ở vùng máy chủ của Functions, nên MỌI request (kể cả trang đã cache sẵn trên CDN)
// đều phải đi một vòng tới đó trước khi nhận byte đầu tiên. Cookie giờ được xác minh bằng
// Web Crypto (lib/auth/session-token-edge.ts), cho cùng kết quả với lib/auth/session-token.ts.
//
// Tên cookie viết thẳng ở đây (không import từ session-token.ts vì file đó dùng node:crypto
// và "server-only"); scripts/check-home-static.mjs giữ hai nơi khớp nhau.
const SESSION_COOKIE = "vxt_session";

const NON_PRODUCTION = ["preview", "development"].includes(process.env.VERCEL_ENV ?? "") || process.env.VEXIM_DEPLOY_ENV === "staging";
const INDEXABLE = !NON_PRODUCTION && process.env.PUBLIC_SITE_INDEXABLE === "true";
// OAuth verification must reach these public policies even before marketing pages are indexable.
// Danh sách này phải khớp CHÍNH XÁC với allow-list của app/robots.ts và với
// legalRoutes của app/sitemap.ts. Trước đây thiếu "/cookie-policy" và
// "/platform-rules": robots.txt cho phép bot đọc /cookie-policy nhưng middleware
// vẫn gắn X-Robots-Tag: noindex, còn /platform-rules (bản tiếng Anh của
// /quy-che-hoat-dong) thì không được khai ở đâu cả — Google nhận hai tín hiệu
// ngược nhau cho cùng một trang.
const LEGAL_PATHS = new Set(["/privacy-policy", "/cookie-policy", "/terms-of-service", "/platform-rules", "/thong-tin-chu-quan", "/quy-che-hoat-dong", "/dieu-khoan-su-dung", "/chinh-sach-bao-mat", "/khieu-nai"]);
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

/**
 * "/" không có ?q= / ?cat= → bản trang chủ dựng sẵn theo ngôn ngữ (lib/public/home-route.ts).
 * Chỉ GET/HEAD: POST (Server Action) vẫn đi đúng route gốc.
 */
function homeRewriteTarget(req: NextRequest): URL | null {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const params = req.nextUrl.searchParams;
  if (params.get("q")?.trim() || params.get("cat")?.trim()) return null;
  const target = req.nextUrl.clone();
  target.pathname = homeRenderPath(params.get("lang") === "vi" ? "vi" : "en");
  return target;
}

function homeResponse(req: NextRequest): NextResponse {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (host.startsWith("crm.") || host.endsWith(".vercel.app")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return finish(req, homeRewriteTarget(req));
}

export function middleware(req: NextRequest): NextResponse | Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Giữ đúng phạm vi cũ: chỉ trang chủ "/" từng có hai chuyển hướng này
  // (app/(public)/page.tsx), các trang công khai khác không bị ảnh hưởng.
  if (pathname === "/") {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    // Khách (không có cookie phiên) — tuyệt đại đa số — không phải chờ bước xác minh nào.
    if (!token) return homeResponse(req);
    return verifySessionTokenEdge(token).then((session) => session
      ? NextResponse.redirect(new URL("/crm/dashboard", req.url))
      : homeResponse(req));
  }

  // Route nội bộ của trang chủ dựng sẵn: không để lộ thành URL thứ hai (trùng nội dung).
  const publicHome = publicHomeUrlFor(pathname);
  if (publicHome) return NextResponse.redirect(new URL(publicHome, req.url), 308);

  // Bản động của trang sản phẩm chỉ đến được qua viết lại bên dưới, không gõ thẳng URL.
  const publicProduct = publicProductUrlFor(pathname);
  if (publicProduct) return NextResponse.redirect(new URL(publicProduct, req.url), 308);

  // Route nội bộ của trang danh mục dựng sẵn: không để lộ thành URL thứ hai (trùng nội dung).
  const publicCategory = publicCategoryUrlFor(pathname);
  if (publicCategory) return NextResponse.redirect(new URL(publicCategory, req.url), 308);

  // Trang danh mục: khách nhận bản dựng sẵn; người có phiên hợp lệ giữ bản động.
  const categoryTarget = req.method === "GET" || req.method === "HEAD"
    ? categoryRenderTarget(pathname, req.nextUrl.searchParams) : null;
  if (categoryTarget) {
    const rewrite = () => {
      const target = req.nextUrl.clone();
      target.pathname = categoryTarget;
      // Ngôn ngữ đã nằm trong đường dẫn; bỏ query (utm_*, gclid…) để mọi lượt xem dùng chung một bản cache.
      target.search = "";
      return finish(req, target);
    };
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return rewrite();
    return verifySessionTokenEdge(token).then((session) => session ? finish(req, null) : rewrite());
  }

  // Trang sản phẩm: khách nhận bản dựng sẵn từ CDN; chỉ request có cookie phiên mới phải xác minh.
  const staffProduct = req.method === "GET" || req.method === "HEAD" ? staffProductViewPath(pathname) : null;
  const sessionToken = staffProduct ? req.cookies.get(SESSION_COOKIE)?.value : undefined;
  if (staffProduct && sessionToken) {
    return verifySessionTokenEdge(sessionToken).then((session) => {
      if (!session) return finish(req, null);
      const target = req.nextUrl.clone();
      target.pathname = staffProduct;
      return finish(req, target);
    });
  }

  return finish(req, null);
}

function finish(req: NextRequest, rewriteTo: URL | null): NextResponse {
  const { pathname } = req.nextUrl;
  // Root layout đọc x-pathname để đặt <html lang> đúng khu vực (EN công khai / VI nội bộ).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  const init = { request: { headers: requestHeaders } };
  const res = rewriteTo ? NextResponse.rewrite(rewriteTo, init) : NextResponse.next(init);

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
