/**
 * Trang danh mục /products/<slug>: bản dựng sẵn (ISR) cho khách — hằng số dùng chung cho
 * middleware.ts, route app/(public)/products/category-render và các component đọc pathname.
 *
 * Vì sao: /products/[slug] đọc `searchParams` (?lang=, ?cert=, ?page=) và phiên nhân viên (xem
 * trước danh mục nháp), nên luôn render động — mỗi lượt xem đều chờ máy chủ dựng lại trang và tra
 * Supabase (PageSpeed: máy chủ trả trang ~600 ms). Middleware giờ viết lại (rewrite, URL trên trình
 * duyệt KHÔNG đổi) lượt xem "trần" của khách:
 *
 *   /products/<slug>          → /products/category-render/en/<slug>
 *   /products/<slug>?lang=vi  → /products/category-render/vi/<slug>
 *
 * Hai bản này được dựng sẵn, CDN trả HTML ngay, làm mới mỗi phút và khi CRM/cổng NCC gọi
 * revalidatePath("/products", "layout") (route nội bộ nằm dưới /products nên được làm mới cùng).
 * Vẫn đi vào bản động cũ: lọc chứng nhận (?cert=), trang 2 trở đi (?page=), và người có cookie phiên
 * hợp lệ (nhân viên xem trước danh mục nháp). URL công khai, canonical và hreflang giữ nguyên.
 *
 * Gõ thẳng /products/category-render/... sẽ được middleware chuyển về URL công khai tương ứng.
 * Vì vậy "category-render" không được dùng làm slug danh mục.
 */
export const CATEGORY_RENDER_SEGMENT = "category-render";
export const CATEGORY_RENDER_PREFIX = `/products/${CATEGORY_RENDER_SEGMENT}`;
export const CATEGORY_RENDER_LANGS = ["en", "vi"] as const;
export type CategoryRenderLang = (typeof CATEGORY_RENDER_LANGS)[number];

const PUBLIC_CATEGORY_PATH = /^\/products\/([^/]+)\/?$/;
const RENDER_CATEGORY_PATH = /^\/products\/category-render\/(en|vi)\/([^/]+)\/?$/;

export function categoryRenderPath(slug: string, lang: CategoryRenderLang): string {
  return `${CATEGORY_RENDER_PREFIX}/${lang}/${slug}`;
}

/** Slug của trang danh mục công khai /products/<slug>; null nếu không phải trang danh mục. */
export function publicCategorySlug(pathname: string): string | null {
  const match = PUBLIC_CATEGORY_PATH.exec(pathname);
  if (!match || match[1] === CATEGORY_RENDER_SEGMENT) return null;
  return match[1];
}

/**
 * Đường dẫn bản dựng sẵn cho một lượt xem trang danh mục; null khi lượt xem cần bản động
 * (không phải trang danh mục, đang lọc chứng nhận, hoặc trang 2 trở đi).
 *
 * Các tham số khác (utm_*, gclid…) không đổi nội dung trang nên vẫn nhận bản dựng sẵn.
 */
export function categoryRenderTarget(pathname: string, params: URLSearchParams): string | null {
  const slug = publicCategorySlug(pathname);
  if (!slug) return null;
  if (params.has("cert")) return null;
  const page = params.get("page");
  if (page !== null && page !== "1") return null;
  return categoryRenderPath(slug, params.get("lang") === "vi" ? "vi" : "en");
}

/** Pathname công khai của route nội bộ /products/category-render/...; null nếu không phải route đó. */
export function publicCategoryPathFor(pathname: string): string | null {
  if (pathname !== CATEGORY_RENDER_PREFIX && !pathname.startsWith(`${CATEGORY_RENDER_PREFIX}/`)) return null;
  const match = RENDER_CATEGORY_PATH.exec(pathname);
  return match ? `/products/${match[2]}` : "/";
}

/** URL công khai đầy đủ (giữ ?lang=vi) để chuyển hướng khi ai đó gõ thẳng route nội bộ. */
export function publicCategoryUrlFor(pathname: string): string | null {
  const path = publicCategoryPathFor(pathname);
  if (path === null) return null;
  return RENDER_CATEGORY_PATH.exec(pathname)?.[1] === "vi" ? `${path}?lang=vi` : path;
}
