import "server-only";

import { productSourceHash } from "@/lib/ai/translate-content";
import { publicExportPortDisplay } from "@/lib/public/product-detail-display";
import type { SupplierProduct } from "@/lib/types";

/**
 * Prefer the saved English port only while it still matches the product source.
 * Otherwise use a known place alias or keep the supplier's current input intact.
 */
export function publicProductExportPortDisplay(product: SupplierProduct): string {
  const source = product.export_port?.trim() || "";
  if (!source) return "";
  const meta = product.translation_meta;
  const translated = typeof meta?.fields?.export_port === "string" ? meta.fields.export_port.trim() : "";
  // Product translation hashes and sends at most 180 characters of this field.
  // Longer legacy values must stay intact rather than use a partial translation.
  const current = translated && source.length <= 180 && meta?.source_hash === productSourceHash(product);
  return publicExportPortDisplay(current ? translated : source);
}
