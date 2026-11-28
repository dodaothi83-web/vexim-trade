/** Explicit, privacy-safe public page keys. Never include query strings, tokens or buyer data. */
const staticPages = new Map([
  ["/", "home"], ["/rfq", "rfq"], ["/blog", "blog"], ["/blog/xuat-khau", "blog"],
  ["/cashew", "cashew"], ["/compare", "compare"],
  ["/for-suppliers", "for-suppliers"], ["/how-it-works", "how-it-works"], ["/how-we-verify", "how-we-verify"],
]);

export function publicSitePageKey(path: unknown): string | null {
  if (typeof path !== "string" || path.length > 150 || path.includes("?") || path.includes("#")) return null;
  const pathname = path.replace(/\/$/, "") || "/";
  const fixed = staticPages.get(pathname);
  if (fixed) return fixed;
  // Bài tiếng Việt (/blog/xuat-khau/<slug>) đếm chung nhóm bài viết; slug là duy nhất trong bảng posts.
  const viArticle = /^\/blog\/xuat-khau\/([a-z0-9][a-z0-9-]{0,99})$/.exec(pathname);
  if (viArticle) return `article:${viArticle[1]}`;
  const match = /^\/(products|blog)\/([a-z0-9][a-z0-9-]{0,99})$/.exec(pathname);
  if (!match) return null;
  return match[1] === "products" ? `category:${match[2]}` : `article:${match[2]}`;
}
