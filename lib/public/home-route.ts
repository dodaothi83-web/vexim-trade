import { publicProductUrlFor } from "@/lib/public/product-route";

/**
 * Trang chủ tĩnh (ISR) theo ngôn ngữ — hằng số dùng chung cho middleware.ts, route
 * app/(public)/homepage/[lang] và các component đọc pathname.
 *
 * Vì sao có route nội bộ này: "/" đọc `searchParams` (?lang=vi, ?q=, ?cat=) nên luôn phải
 * render động — mỗi lượt xem trang chủ đều chờ máy chủ dựng lại HTML và tra Supabase
 * (PageSpeed đo ~620 ms chỉ riêng thời gian máy chủ trả trang). Middleware giờ viết lại
 * (rewrite, KHÔNG đổi URL trên trình duyệt) "/" → /homepage/en và "/?lang=vi" → /homepage/vi,
 * hai trang được dựng sẵn và làm mới mỗi 5 phút, nên CDN trả HTML ngay. URL công khai,
 * canonical và hreflang giữ nguyên ("/" và "/?lang=vi"). Chỉ khi có ?q= hoặc ?cat= (lọc
 * trên trang chủ) mới đi vào bản động cũ ở app/(public)/page.tsx.
 *
 * Gõ thẳng /homepage/... sẽ được middleware chuyển về URL công khai tương ứng.
 */
export const HOME_RENDER_PREFIX = "/homepage";
export const HOME_RENDER_LANGS = ["en", "vi"] as const;
export type HomeRenderLang = (typeof HOME_RENDER_LANGS)[number];

export function homeRenderPath(lang: HomeRenderLang): string {
  return `${HOME_RENDER_PREFIX}/${lang}`;
}

/** URL công khai của một đường dẫn nội bộ /homepage/...; null nếu không phải route nội bộ. */
export function publicHomeUrlFor(pathname: string): string | null {
  if (pathname !== HOME_RENDER_PREFIX && !pathname.startsWith(`${HOME_RENDER_PREFIX}/`)) return null;
  return pathname.replace(/\/$/, "") === homeRenderPath("vi") ? "/?lang=vi" : "/";
}

/**
 * Pathname "công khai" cho component client: trang chủ tĩnh được dựng tại /homepage/en|vi
 * nên khi dựng sẵn, usePathname() trả đường dẫn nội bộ, còn trên trình duyệt là "/". Quy cả
 * hai về "/" để HTML dựng sẵn và lúc hydrate khớp nhau (ẩn footer phụ, đánh dấu trang chủ...).
 */
export function toPublicPathname(pathname: string): string {
  if (publicHomeUrlFor(pathname) !== null) return "/";
  // Bản động của trang sản phẩm cho người có phiên (xem lib/public/product-route.ts).
  return publicProductUrlFor(pathname) ?? pathname;
}
