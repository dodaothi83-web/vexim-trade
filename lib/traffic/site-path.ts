/** Explicit, privacy-safe public page keys. Never include query strings, tokens or buyer data. */
const staticPages = new Map([
  ["/", "home"], ["/rfq", "rfq"], ["/blog", "blog"],
  ["/cashew", "cashew"], ["/compare", "compare"],
  ["/for-suppliers", "for-suppliers"], ["/how-we-verify", "how-we-verify"],
]);

export function publicSitePageKey(path: unknown): string | null {
  if (typeof path !== "string" || path.length > 150 || path.includes("?") || path.includes("#")) return null;
  const pathname = path.replace(/\/$/, "") || "/";
  const fixed = staticPages.get(pathname);
  if (fixed) return fixed;
  const match = /^\/(products|blog)\/([a-z0-9][a-z0-9-]{0,99})$/.exec(pathname);
  if (!match) return null;
  return match[1] === "products" ? `category:${match[2]}` : `article:${match[2]}`;
}
