import "server-only";

import { createHash } from "node:crypto";
import { getObject } from "@/lib/media/storage";
import { parseDraftImageSelection } from "@/lib/products/product-form-image-selection";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const MAX_BYTES = 8 * 1024 * 1024;
type Result = { ok: true } | { ok: false; reason: "invalid_snapshot" | "existing_media_unverified" | "image_unavailable" | "image_changed" };

/**
 * Read-only byte check for staged images. Existing media has no recorded content
 * hash and must not be silently treated as verified. It needs a safe snapshot/copy
 * workflow before approval. This helper cannot itself approve: a later single DB
 * transaction must recheck the exact submission and locked image metadata, while
 * the storage workflow must prevent writes to these immutable paths.
 */
export async function verifyStagedReviewImages(input: {
  productId: string; supplierId: string; selection: unknown; snapshot: unknown;
}): Promise<Result> {
  const selection = parseDraftImageSelection(input.selection);
  if (!UUID.test(input.productId) || !UUID.test(input.supplierId) || !selection?.length ||
      !Array.isArray(input.snapshot) || input.snapshot.length !== selection.length)
    return { ok: false, reason: "invalid_snapshot" };
  const productId = input.productId.toLowerCase(), supplierId = input.supplierId.toLowerCase();
  const files: Array<{ path: string; bytes: number; hash: string }> = [];
  for (let i = 0; i < selection.length; i++) {
    const ref = selection[i], entry = input.snapshot[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || entry.source !== ref.source ||
        !entry.row || typeof entry.row !== "object" || Array.isArray(entry.row))
      return { ok: false, reason: "invalid_snapshot" };
    const row = entry.row as Record<string, unknown>;
    if (typeof row.id !== "string" || row.id.toLowerCase() !== ref.id ||
        typeof row.product_id !== "string" || row.product_id.toLowerCase() !== productId ||
        typeof row.supplier_id !== "string" || row.supplier_id.toLowerCase() !== supplierId)
      return { ok: false, reason: "invalid_snapshot" };
    if (ref.source === "media") return { ok: false, reason: "existing_media_unverified" };
    const base = `products/${productId}/${ref.id}`;
    if (row.mime !== "image/webp" || row.storage_path !== `${base}.webp` || row.thumb_path !== `${base}-thumb.webp` ||
        typeof row.sha256 !== "string" || !HASH.test(row.sha256) || typeof row.thumb_sha256 !== "string" || !HASH.test(row.thumb_sha256) ||
        typeof row.bytes !== "number" || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || row.bytes > MAX_BYTES ||
        typeof row.thumb_bytes !== "number" || !Number.isSafeInteger(row.thumb_bytes) || row.thumb_bytes < 1 || row.thumb_bytes > MAX_BYTES)
      return { ok: false, reason: "invalid_snapshot" };
    files.push({ path: row.storage_path, bytes: row.bytes, hash: row.sha256 },
      { path: row.thumb_path, bytes: row.thumb_bytes, hash: row.thumb_sha256 });
  }
  for (const file of files) {
    let object: Awaited<ReturnType<typeof getObject>>;
    try { object = await getObject(file.path); }
    catch { return { ok: false, reason: "image_unavailable" }; }
    if (!object) return { ok: false, reason: "image_unavailable" };
    if (object.data.byteLength !== file.bytes || createHash("sha256").update(object.data).digest("hex") !== file.hash)
      return { ok: false, reason: "image_changed" };
  }
  return { ok: true };
}
