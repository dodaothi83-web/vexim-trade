import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getObject } from "@/lib/media/storage";
import { isExpired } from "@/lib/media/readiness";
import { uploadPrivateProductFormImage } from "@/lib/products/product-form-private-upload";
import type { DataStore } from "@/lib/db/types";
import type { MediaAsset } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8 * 1024 * 1024;
type Database = Pick<SupabaseClient, "rpc" | "from">; // Same service-role client used for authorization and upload RPC.
type Result = { ok: true; revision: number; uploaded: number } |
  { ok: false; message: string; uploaded: number; requiresReload?: boolean };

/**
 * Copy selected existing photos into a new private draft, not a published asset.
 * Caller must authenticate an active supplier or staff member and authorize both
 * source and destination in the same database. No original file or row is ever
 * changed/deleted. A partial or ambiguous result requires a reload and manual
 * reconciliation, never an automatic retry of the entire batch. This is not a
 * split operation and is not connected to any page yet.
 */
export async function copyImagesToNewProductDraft(input: {
  db: Database; store: Pick<DataStore, "getProduct" | "getMedia">; supplierId: string; sourceProductId: string;
  destinationProductId: string; sourceUpdatedAt: string; userId: string; staff: boolean;
  expectedRevision: number; sourceImageIds: readonly string[];
}): Promise<Result> {
  const { db, store, supplierId, sourceProductId, destinationProductId, sourceUpdatedAt, userId, staff, expectedRevision, sourceImageIds } = input;
  const fail = (message: string, uploaded = 0, requiresReload = false): Result => ({ ok: false, message, uploaded, requiresReload });
  if (![supplierId, sourceProductId, destinationProductId].every((id) => UUID.test(id)) ||
      sourceProductId.toLowerCase() === destinationProductId.toLowerCase() || !userId.trim() || typeof staff !== "boolean" ||
      !Number.isFinite(Date.parse(sourceUpdatedAt)) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      sourceImageIds.length < 1 || sourceImageIds.length > 8 || sourceImageIds.some((id) => !UUID.test(id)) ||
      new Set(sourceImageIds.map((id) => id.toLowerCase())).size !== sourceImageIds.length)
    return fail("Yêu cầu sao chép ảnh không hợp lệ.");
  let uploaded = 0, revision = expectedRevision;
  try {
    const [source, destination] = await Promise.all([store.getProduct(sourceProductId), store.getProduct(destinationProductId)]);
    if (!source || !destination || source.supplier_id !== supplierId || destination.supplier_id !== supplierId ||
        source.updated_at !== sourceUpdatedAt || destination.supplier_review_status !== "draft" || destination.supplier_originated !== true)
      return fail("Sản phẩm gốc hoặc bản nháp đã thay đổi. Hãy tải lại trang.", 0, true);
    const { data: draft, error: draftError } = await db.from("product_form_drafts").select("revision,image_selection")
      .eq("product_id", destinationProductId).eq("supplier_id", supplierId).maybeSingle();
    if (draftError || !draft || draft.revision !== expectedRevision || !Array.isArray(draft.image_selection) || draft.image_selection.length !== 0)
      return fail("Bản nháp không còn trống hoặc đã thay đổi. Hãy tải lại trang.", 0, true);
    const assets: MediaAsset[] = [];
    const paths = new Set<string>();
    const pattern = new RegExp(`^products/${sourceProductId.toLowerCase()}/[a-f0-9-]{20,}\\.(?:jpe?g|png|webp)$`, "i");
    for (const id of sourceImageIds) {
      const asset = await store.getMedia(id);
      if (!asset || asset.id.toLowerCase() !== id.toLowerCase() || asset.owner_type !== "product" || asset.product_id !== source.id ||
          asset.supplier_id !== supplierId || asset.kind !== "image" || isExpired(asset) ||
          (!staff && asset.audience !== "buyer" && asset.created_by !== userId) || !asset.storage_path ||
          !pattern.test(asset.storage_path) || paths.has(asset.storage_path))
        return fail("Không xác nhận được quyền hoặc đường dẫn ảnh gốc.");
      // The serving ACL uses paths. Do not read a path with multiple owners.
      const { data: owners, error } = await db.from("media_assets").select("id")
        .or(`storage_path.eq.${asset.storage_path},thumb_path.eq.${asset.storage_path}`);
      if (error || !Array.isArray(owners) || owners.length !== 1 || owners[0].id !== asset.id)
        return fail("Đường dẫn ảnh gốc không có chủ sở hữu duy nhất.");
      const { data: staged, error: stagedError } = await db.from("product_form_staged_images").select("id")
        .or(`storage_path.eq.${asset.storage_path},thumb_path.eq.${asset.storage_path}`);
      if (stagedError || !Array.isArray(staged) || staged.length) return fail("Đường dẫn ảnh gốc không có chủ sở hữu duy nhất.");
      assets.push(asset); paths.add(asset.storage_path);
    }
    // Read first, then recheck the source version and metadata before writing a
    // private copy. An upload re-encodes the image; it never overwrites the source.
    const files: File[] = [], hashes: string[] = [];
    for (const asset of assets) {
      const object = await getObject(asset.storage_path!);
      if (!object || !object.data.length || object.data.length > MAX_BYTES) return fail("Không đọc được ảnh gốc hoặc ảnh lớn hơn 8 MB.");
      hashes.push(createHash("sha256").update(object.data).digest("hex"));
      files.push(new File([new Uint8Array(object.data)], asset.caption?.slice(0, 150) || "anh-san-pham.webp"));
    }
    const latest = await store.getProduct(sourceProductId);
    if (!latest || latest.supplier_id !== supplierId || latest.updated_at !== sourceUpdatedAt)
      return fail("Sản phẩm gốc đã thay đổi. Hãy tải lại trang.", 0, true);
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      const latestAsset = await store.getMedia(asset.id);
      const latestObject = await getObject(asset.storage_path!);
      if (!latestAsset || JSON.stringify(latestAsset) !== JSON.stringify(asset) || !latestObject ||
          latestObject.data.length > MAX_BYTES || createHash("sha256").update(latestObject.data).digest("hex") !== hashes[i])
        return fail("Ảnh gốc đã thay đổi. Hãy tải lại trang.", 0, true);
    }
    for (const file of files) {
      const result = await uploadPrivateProductFormImage({ db, supplierId, productId: destinationProductId, userId,
        expectedRevision: revision, file });
      if (!result.ok) return fail(result.message, uploaded, uploaded > 0 || result.requiresReload === true);
      if (result.revision !== revision + 1 || result.image.source !== "staged" || !UUID.test(result.image.id))
        return fail("Không xác nhận được phiên bản ảnh. Hãy tải lại trang.", uploaded, true);
      revision = result.revision;
      uploaded++;
    }
    return { ok: true, revision, uploaded };
  } catch (error) {
    console.error("[product-form] copy clone images", error);
    // A write may have committed despite a thrown response, including the first.
    return fail("Không xác nhận được kết quả sao chép ảnh. Hãy tải lại trang.", uploaded, true);
  }
}
