import { L3_EXPORT_ITEMS, type MediaAsset } from "@/lib/types";

/** Photos of legal documents are valid evidence even when uploaded under the Image tab.
 * Only files physically attached to THIS verification may be passed to this helper.
 * Supplier-library files and video links must never qualify.
 */
export function hasDocumentAuditEvidence(media: Pick<MediaAsset, "kind" | "storage_path">[]): boolean {
  return media.some((m) => !!m.storage_path &&
    (m.kind === "document" || m.kind === "certificate" || m.kind === "image"));
}

/**
 * Evidence must belong to the exact L3 verification (the caller scopes the list).
 * Existing shipping/receipt rows and old checked documents keep their old rules.
 * Supplier-submitted export files keep their original category and only qualify
 * after a person explicitly marks one as checked in the verification.
 */
export function hasDeliveryAuditEvidence(media: Pick<MediaAsset, "kind" | "storage_path" | "checklist_key" | "status">[]): boolean {
  return media.some((m) => !!m.storage_path && (
    (["shipping_proof", "delivery_proof"].includes(m.checklist_key ?? "") && ["image", "document", "certificate"].includes(m.kind)) ||
    (m.kind === "document" && m.status === "checked") ||
    (m.status === "checked" && ["image", "document", "certificate"].includes(m.kind) &&
      L3_EXPORT_ITEMS.some((item) => item.key === m.checklist_key))
  ));
}
