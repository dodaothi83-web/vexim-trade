import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { validateUpload } from "@/lib/media/validate";
import { prepareSupplierProductImage } from "@/lib/media/prepare-supplier-product-image";
import { putNewObject } from "@/lib/media/storage";
import type { ProductFormImage } from "@/lib/products/product-form-session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: true; revision: number; image: ProductFormImage } |
  { ok: false; message: string; requiresReload?: boolean };
type Database = { rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * Caller must first authenticate the active supplier or authorized staff against
 * the same database and verify product ownership. This never creates a public
 * media_assets row. The paths are exclusive writes with server-generated IDs.
 * It is intentionally not connected to a route until the private preview and
 * atomic approval path are complete.
 *
 * No storage object is deleted after a failed/ambiguous write or RPC. A timeout
 * can mean that the object or the DB transaction succeeded. Deletion in that
 * case could destroy a committed image. Orphans require a separate, conservative
 * cleanup process that verifies all references and a suitable grace period.
 */
export async function uploadPrivateProductFormImage(input: {
  db: Database; supplierId: string; productId: string; userId: string; expectedRevision: number; file: File;
  /** Full server-read media row, never client-provided; SQL locks and compares it. */
  replaceMedia?: Record<string, unknown>;
}): Promise<Result> {
  const { db, supplierId, productId, userId, expectedRevision, file, replaceMedia } = input;
  if (!UUID.test(supplierId) || !UUID.test(productId) || !userId.trim() || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      !(file instanceof File) || file.size <= 0 || file.size > 8 * 1024 * 1024 ||
      (replaceMedia && (typeof replaceMedia.id !== "string" || !UUID.test(replaceMedia.id) ||
        typeof replaceMedia.product_id !== "string" || replaceMedia.product_id.toLowerCase() !== productId.toLowerCase() ||
        typeof replaceMedia.supplier_id !== "string" || replaceMedia.supplier_id.toLowerCase() !== supplierId.toLowerCase())))
    return { ok: false, message: "Ảnh không hợp lệ hoặc lớn hơn 8 MB." };
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { return { ok: false, message: "Không đọc được ảnh." }; }
  const checked = validateUpload("image", bytes, file.name);
  if (!checked.ok) return { ok: false, message: checked.message ?? "Ảnh không hợp lệ." };
  let prepared: Awaited<ReturnType<typeof prepareSupplierProductImage>>;
  try { prepared = await prepareSupplierProductImage(bytes); }
  catch { return { ok: false, message: "Ảnh không đọc được hoặc kích thước quá lớn." }; }
  if (!prepared.main.length || prepared.main.length > 8 * 1024 * 1024 || !prepared.thumb.length || prepared.thumb.length > 8 * 1024 * 1024 ||
      !Number.isSafeInteger(prepared.width) || prepared.width < 1 || prepared.width > 20000 ||
      !Number.isSafeInteger(prepared.height) || prepared.height < 1 || prepared.height > 20000)
    return { ok: false, message: "Ảnh sau xử lý không hợp lệ." };

  const imageId = randomUUID();
  const normalizedProductId = productId.toLowerCase();
  const base = `products/${normalizedProductId}/${imageId}`;
  try {
    await putNewObject(`${base}.webp`, prepared.main, "image/webp");
    await putNewObject(`${base}-thumb.webp`, prepared.thumb, "image/webp");
  } catch (error) {
    console.error("[product-form] private image storage outcome unknown", { imageId, productId, error });
    return { ok: false, requiresReload: true, message: "Không xác nhận được kết quả tải ảnh. Hãy tải lại trang." };
  }
  try {
    const { data, error } = await db.rpc("stage_product_form_image", {
      p_supplier_id: supplierId, p_product_id: normalizedProductId, p_user_id: userId, p_expected_revision: expectedRevision,
      p_id: imageId, p_caption: file.name.slice(0, 150), p_bytes: prepared.main.length,
      p_width: prepared.width, p_height: prepared.height,
      p_sha256: createHash("sha256").update(prepared.main).digest("hex"),
      p_thumb_bytes: prepared.thumb.length, p_thumb_sha256: createHash("sha256").update(prepared.thumb).digest("hex"),
      ...(replaceMedia ? { p_replaces_media_id: replaceMedia.id, p_expected_media: replaceMedia } : {}),
    });
    if (error) throw error;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const result = data as Record<string, unknown>;
      if (result.status === "created" && result.image_id === imageId && result.revision === expectedRevision + 1) {
        return { ok: true, revision: expectedRevision + 1, image: { source: "staged", id: imageId,
          url: `/api/product-form/images/${encodeURIComponent(normalizedProductId)}/${encodeURIComponent(imageId)}` } };
      }
      if (result.status === "image_limit") return { ok: false, message: "Tối đa 8 ảnh sản phẩm." };
    }
    return { ok: false, requiresReload: true, message: "Ảnh hoặc sản phẩm đã thay đổi. Hãy tải lại trang." };
  } catch (error) {
    console.error("[product-form] private image registration outcome unknown", { imageId, productId, error });
    return { ok: false, requiresReload: true, message: "Không xác nhận được kết quả tải ảnh. Hãy tải lại trang." };
  }
}
