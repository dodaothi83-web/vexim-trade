import type { Supplier } from "@/lib/types";

type SupplierSeoFields = Pick<Supplier, "slug" | "name" | "is_demo" | "summary_i18n">;

/** Deliberately exclude synthetic profiles even when somebody marks their records published. */
export function isSyntheticSupplier(s: SupplierSeoFields): boolean {
  const summary = Object.values(s.summary_i18n ?? {}).join(" ");
  return !!s.is_demo || /(?:^|[-_])test(?:[-_]|$)|do-not-contact/i.test(s.slug ?? "") ||
    /\b(?:test only|test supplier|do not contact)\b/i.test(`${s.name} ${summary}`);
}

/** Published is not the same as suitable for search: require a meaningful description and a buyer-ready catalogue. */
export function supplierProfileIndexable(s: SupplierSeoFields & { main_products: readonly unknown[] }): boolean {
  const summary = Object.values(s.summary_i18n ?? {}).join(" ").trim();
  return !isSyntheticSupplier(s) && s.main_products.length > 0 && summary.length >= 40;
}

/** JSON-LD in an HTML script must not allow a supplier-provided closing tag. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
