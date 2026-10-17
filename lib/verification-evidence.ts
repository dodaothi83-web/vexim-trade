import type { MediaAsset } from "@/lib/types";

/** Photos of legal documents are valid evidence even when uploaded under the Image tab.
 * Only files physically attached to THIS verification may be passed to this helper.
 * Supplier-library files and video links must never qualify.
 */
export function hasDocumentAuditEvidence(media: Pick<MediaAsset, "kind" | "storage_path">[]): boolean {
  return media.some((m) => !!m.storage_path &&
    (m.kind === "document" || m.kind === "certificate" || m.kind === "image"));
}
