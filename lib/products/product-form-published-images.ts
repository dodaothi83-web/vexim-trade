import { isExpired } from "@/lib/media/readiness";
import type { MediaAsset } from "@/lib/types";

export type PublishedFormImageRef = { product_id: string; submission_id: string; media_id: string; position: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Project only the images from a proven approved form, in its chosen order.
 * Null means the product has no approved form and keeps the old gallery. Once
 * an approved form exists, malformed or incomplete proof throws rather than
 * silently falling back to unrelated legacy photos. This is not wired to the
 * buyer pages until the atomic approval transaction writes the manifest.
 */
export function selectPublishedFormImages(input: {
  productId: string; supplierId: string; approvedSubmissionId: string | null;
  refs: readonly PublishedFormImageRef[]; media: readonly MediaAsset[];
}): MediaAsset[] | null {
  const { productId, supplierId, approvedSubmissionId, refs, media } = input;
  if (!UUID.test(productId) || !UUID.test(supplierId)) throw new Error("Invalid product image owner");
  if (approvedSubmissionId === null) {
    if (refs.length) throw new Error("Form image manifest without approved submission");
    return null;
  }
  if (!UUID.test(approvedSubmissionId) || refs.length < 1 || refs.length > 8) throw new Error("Invalid approved form image manifest");
  const ordered = [...refs].sort((a, b) => a.position - b.position), selected: MediaAsset[] = [];
  const seenIds = new Set<string>(), seenPaths = new Set<string>();
  for (let i = 0; i < ordered.length; i++) {
    const ref = ordered[i];
    if (ref.product_id !== productId || ref.submission_id !== approvedSubmissionId || ref.position !== i ||
        !UUID.test(ref.media_id) || seenIds.has(ref.media_id)) throw new Error("Invalid approved form image reference");
    const matching = media.filter((asset) => asset.id === ref.media_id);
    if (matching.length !== 1) throw new Error("Approved form image missing or ambiguous");
    const asset = matching[0];
    if (asset.owner_type !== "product" || asset.product_id !== productId || asset.supplier_id !== supplierId || asset.kind !== "image" ||
        asset.audience !== "buyer" || isExpired(asset) || !asset.storage_path || seenPaths.has(asset.storage_path))
      throw new Error("Approved form image unavailable");
    seenIds.add(ref.media_id); seenPaths.add(asset.storage_path); selected.push(asset);
  }
  return selected;
}
