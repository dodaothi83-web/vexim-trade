import { productDescriptionPlainText, sanitizeProductDescriptionHtml } from "@/lib/products/product-description";

/**
 * The same whitelist runs during CMS editing, CMS preview and server rendering.
 * sanitize-html works in both the browser bundle and Next.js server components.
 */
export function sanitizeProductDescriptionInBrowser(raw: string | null | undefined): string {
  const html = sanitizeProductDescriptionHtml(raw);
  // The server stores an empty description as "", including TipTap's empty
  // paragraph/line-break markup. Keep the editor value in the same form.
  return productDescriptionPlainText(html) ? html : "";
}
