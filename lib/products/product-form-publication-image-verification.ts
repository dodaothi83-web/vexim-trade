import "server-only";

import { createHash } from "node:crypto";
import { getObject } from "@/lib/media/storage";
import { parseDraftImageSelection } from "@/lib/products/product-form-image-selection";
import type { PreparedPublicationImage } from "@/lib/products/product-form-promotion-images";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Re-read publication copies immediately before the future approval transaction.
 * This verifies byte identity and binding to the exact staged snapshot. It is not
 * an approval and cannot lock Storage against privileged mutation. The caller
 * must obtain an exact locked DB context, enforce exclusive destination paths,
 * and reject any mismatch inside the approval transaction as well.
 */
export async function verifyPublicationImageCopies(input: {
  productId: string; supplierId: string; selection: unknown; snapshot: unknown; images: readonly PreparedPublicationImage[];
}): Promise<boolean> {
  if (!UUID.test(input.productId) || !UUID.test(input.supplierId)) return false;
  const refs = parseDraftImageSelection(input.selection);
  if (!refs?.length || refs.length > 8 || refs.some((ref) => ref.source !== "staged") ||
      !Array.isArray(input.snapshot) || input.snapshot.length !== refs.length || input.images.length !== refs.length) return false;
  try {
    const snapshot = structuredClone(input.snapshot), images = structuredClone(input.images);
    const sourceIds = new Set(refs.map((ref) => ref.id)), destinationIds = new Set<string>();
    for (let i = 0; i < refs.length; i++) {
      const item = snapshot[i], image = images[i];
      if (!object(item) || item.source !== "staged" || !object(item.row) || !image || !UUID.test(image.mediaId) ||
          sourceIds.has(image.mediaId) || destinationIds.has(image.mediaId)) return false;
      destinationIds.add(image.mediaId);
      const row = item.row, base = `product-form-images/${input.productId}/${image.mediaId}`;
      if (image.stagedId !== refs[i].id || row.id !== image.stagedId || row.product_id !== input.productId || row.supplier_id !== input.supplierId ||
          row.mime !== "image/webp" || image.storagePath !== `${base}.webp` || image.thumbPath !== `${base}-thumb.webp` ||
          image.bytes !== row.bytes || image.thumbBytes !== row.thumb_bytes || image.sha256 !== row.sha256 || image.thumbSha256 !== row.thumb_sha256 ||
          image.width !== row.width || image.height !== row.height || image.caption !== row.caption ||
          !Number.isSafeInteger(image.bytes) || image.bytes < 1 || !Number.isSafeInteger(image.thumbBytes) || image.thumbBytes < 1 ||
          !Number.isSafeInteger(image.width) || image.width < 1 || image.width > 20000 ||
          !Number.isSafeInteger(image.height) || image.height < 1 || image.height > 20000 ||
          typeof image.caption !== "string" || image.caption.length > 150 ||
          !/^[0-9a-f]{64}$/.test(image.sha256) || !/^[0-9a-f]{64}$/.test(image.thumbSha256)) return false;
      for (const [path, size, hash] of [[image.storagePath, image.bytes, image.sha256], [image.thumbPath, image.thumbBytes, image.thumbSha256]] as const) {
        const file = await getObject(path);
        if (!file || file.data.length !== size || createHash("sha256").update(file.data).digest("hex") !== hash) return false;
      }
    }
    return true;
  } catch (error) {
    console.error("[product-form] verify publication copies", error);
    return false;
  }
}
