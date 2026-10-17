import type { Certificate, MediaAsset } from "@/lib/types";
import { isExpired } from "@/lib/media/readiness";
import { withoutDirectContacts } from "@/lib/public/product-selection";

export interface PublicCertificateLabel {
  id: string;
  name: string;
  issuer: string | null;
  holder: string | null;
  scope: string | null;
  validUntil: string | null;
}

/** Fail closed: approval of a supplier audit, a document upload or a self-declared string is NOT a product certificate. */
export function publicCertificateLabels(
  supplierId: string, productId: string, certificates: Certificate[], media: MediaAsset[],
  today = new Date().toISOString().slice(0, 10),
): PublicCertificateLabel[] {
  const byId = new Map(media.map((m) => [m.id, m]));
  return certificates.filter((c) => {
    if (c.supplier_id !== supplierId || c.review_status !== "approved" || c.publicly_visible !== true ||
        !c.checked_by || !c.checked_at || !c.approved_product_ids?.includes(productId) || !c.file_media_id ||
        !c.valid_until || c.valid_until < today || !c.holder_name?.trim() || !c.scope_text?.trim()) return false;
    const file = byId.get(c.file_media_id);
    return !!file && file.owner_type === "supplier" && file.supplier_id === supplierId &&
      file.kind === "certificate" && file.audience === "internal" && file.status === "checked" &&
      !!file.storage_path && !isExpired(file) && (!file.expires_on || file.expires_on >= today);
  }).map((c) => ({
    id: c.id, name: withoutDirectContacts(c.name).slice(0, 120),
    issuer: c.issuer ? withoutDirectContacts(c.issuer).slice(0, 120) : null,
    holder: c.holder_name ? withoutDirectContacts(c.holder_name).slice(0, 120) : null,
    scope: c.scope_text ? withoutDirectContacts(c.scope_text).slice(0, 200) : null,
    validUntil: c.valid_until ?? null,
  })).slice(0, 12);
}
