import { sanitizeProductDescriptionHtml } from "@/lib/products/product-description";
import { withoutDirectContacts } from "@/lib/public/product-selection";

/** Buyer-safe rich description. No editor code is shipped with this component. */
export function ProductDescription({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  const html = sanitizeProductDescriptionHtml(withoutDirectContacts(value ?? ""));
  if (!html) return null;
  return <div className={`product-description ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
