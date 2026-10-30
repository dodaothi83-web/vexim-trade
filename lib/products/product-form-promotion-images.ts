import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getObject, putNewObject } from "@/lib/media/storage";
import { parseDraftImageSelection } from "@/lib/products/product-form-image-selection";
import { verifyStagedReviewImages } from "@/lib/products/product-form-review-images";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Db = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
export type PreparedPublicationImage = {
  stagedId: string; mediaId: string; storagePath: string; thumbPath: string; caption: string;
  bytes: number; thumbBytes: number; width: number; height: number; sha256: string; thumbSha256: string;
};
type Result = { ok: true; images: PreparedPublicationImage[] } | { ok: false; message: string; requiresReload: boolean };

/**
 * Prepare separate, private and exclusive copies for a future atomic approval.
 * Caller must authorize staff and obtain a validated review context first. These
 * objects have NO media_assets row and are not public until an approval RPC
 * validates the exact context, IDs, path collisions and hashes and publishes the
 * manifest. Never call this from a buyer route or ordinary supplier uploader.
 * Source objects/rows and existing public URLs are never modified or deleted.
 * Partial or uncertain writes are not replayed or deleted; reload and reconcile.
 * Privileged Storage mutation remains outside the application's write-once guard.
 */
export async function preparePublicationImages(input: {
  db: Db; productId: string; supplierId: string; selection: unknown; snapshot: unknown;
}): Promise<Result> {
  let wrote = false;
  const fail = (message: string): Result => ({ ok: false, message, requiresReload: wrote });
  if (!UUID.test(input.productId) || !UUID.test(input.supplierId)) return fail("Dữ liệu ảnh không hợp lệ.");
  const refs = parseDraftImageSelection(input.selection);
  if (!refs?.length || refs.some((ref) => ref.source !== "staged") || !Array.isArray(input.snapshot))
    return fail("Ảnh cần được sao chụp riêng tư trước khi duyệt.");
  try {
    // Detach the snapshot from callers before any asynchronous reads/writes.
    const snapshot = structuredClone(input.snapshot);
    const ready = await input.db.rpc("product_form_image_namespace_ready", {});
    if (ready.error || ready.data !== true) return fail("Cấu hình ảnh riêng tư chưa sẵn sàng.");
    const checked = await verifyStagedReviewImages({ productId: input.productId, supplierId: input.supplierId,
      selection: refs, snapshot });
    if (!checked.ok) return fail("Ảnh đã đổi hoặc không thể kiểm tra. Hãy tải lại trang.");
    const productId = input.productId.toLowerCase(), sourceIds = new Set(refs.map((ref) => ref.id)), newIds = new Set<string>();
    const prepared: Array<{ row: Record<string, unknown>; mediaId: string; stagedId: string }> = [];
    for (let i = 0; i < refs.length; i++) {
      const row = snapshot[i]?.row as Record<string, unknown>;
      if (!row || typeof row.caption !== "string" || row.caption.length > 150 || typeof row.width !== "number" ||
          !Number.isSafeInteger(row.width) || row.width < 1 || row.width > 20000 || typeof row.height !== "number" ||
          !Number.isSafeInteger(row.height) || row.height < 1 || row.height > 20000) return fail("Thông tin ảnh không hợp lệ.");
      const mediaId = randomUUID().toLowerCase();
      if (!UUID.test(mediaId) || sourceIds.has(mediaId) || newIds.has(mediaId)) return fail("Không tạo được mã ảnh an toàn.");
      newIds.add(mediaId); prepared.push({ row, mediaId, stagedId: refs[i].id });
    }
    const images: PreparedPublicationImage[] = [];
    for (const { row, mediaId, stagedId } of prepared) {
      const base = `product-form-images/${productId}/${mediaId}`;
      const pairs = [
        { from: row.storage_path as string, to: `${base}.webp`, bytes: row.bytes as number, hash: row.sha256 as string },
        { from: row.thumb_path as string, to: `${base}-thumb.webp`, bytes: row.thumb_bytes as number, hash: row.thumb_sha256 as string },
      ];
      for (const pair of pairs) {
        const source = await getObject(pair.from);
        if (!source || source.data.length !== pair.bytes || createHash("sha256").update(source.data).digest("hex") !== pair.hash)
          return fail("Ảnh nguồn đã thay đổi. Hãy tải lại trang.");
        wrote = true; // A failure may still mean the exclusive upload committed.
        await putNewObject(pair.to, source.data, "image/webp");
        const copy = await getObject(pair.to);
        if (!copy || copy.data.length !== pair.bytes || createHash("sha256").update(copy.data).digest("hex") !== pair.hash)
          return fail("Không xác nhận được bản sao ảnh. Hãy tải lại trang.");
      }
      images.push({ stagedId, mediaId, storagePath: pairs[0].to, thumbPath: pairs[1].to,
        caption: row.caption as string, bytes: pairs[0].bytes, thumbBytes: pairs[1].bytes, width: row.width as number, height: row.height as number,
        sha256: pairs[0].hash, thumbSha256: pairs[1].hash });
    }
    return { ok: true, images };
  } catch (error) {
    console.error("[product-form] prepare publication images", error);
    return fail("Không xác nhận được bản sao ảnh. Hãy tải lại trang.");
  }
}
