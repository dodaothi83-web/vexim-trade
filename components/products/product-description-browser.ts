import { sanitizeProductDescriptionHtml } from "@/lib/products/product-description";

/**
 * The same whitelist runs during CMS editing, CMS preview and server rendering.
 * sanitize-html works in both the browser bundle and Next.js server components.
 */
export function sanitizeProductDescriptionInBrowser(raw: string | null | undefined): string {
  return sanitizeProductDescriptionHtml(raw);
}
