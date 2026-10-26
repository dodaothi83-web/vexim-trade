/**
 * Shared, dependency-free product-description primitives.
 *
 * Legacy descriptions are plain text. New descriptions are a deliberately small
 * HTML subset produced by the editor and sanitized again on the server.
 */
export const PRODUCT_DESCRIPTION_ALLOWED_TAGS = [
  "p", "h2", "h3", "ul", "li", "strong", "em", "br",
] as const;

const HTML_MARKUP = /<\/?[a-z][^>]*>/i;

export function hasProductDescriptionMarkup(raw: string | null | undefined): boolean {
  return typeof raw === "string" && HTML_MARKUP.test(raw);
}

export function escapeProductDescriptionText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Convert a legacy plain-text value without interpreting it as trusted HTML. */
export function plainTextToProductDescriptionHtml(raw: string | null | undefined): string {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return "";
  return text
    .split(/\n[\t ]*\n+/)
    .map((paragraph) => `<p>${escapeProductDescriptionText(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Prepare either storage generation for an editor or sanitizer. Plain text is
 * escaped; HTML-like input remains markup so the whitelist sanitizer can clean it.
 */
export function normalizeProductDescriptionSource(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return hasProductDescriptionMarkup(value) ? value : plainTextToProductDescriptionHtml(value);
}
