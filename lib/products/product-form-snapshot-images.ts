import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataStore } from "@/lib/db/types";
import type { MediaAsset } from "@/lib/types";
import { getObject } from "@/lib/media/storage";
import { isExpired } from "@/lib/media/readiness";
import { uploadPrivateProductFormImage } from "@/lib/products/product-form-private-upload";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8 * 1024 * 1024;
type Result = { ok: true; revision: number; replaced: number } |
  { ok: false; message: string; replaced: number; requiresReload?: boolean };

/**
 * Prepare existing selected photos for byte-verified review by copying them
 * into the same private draft, without changing public media or the product.
 * The caller must already have authenticated the supplier and authorized this
 * product. This helper is not connected to a page. An uncertain or partial
 * outcome requires reloading the draft, not replaying the whole batch.
 */
export async function snapshotSelectedProductImages(input: {
  db: Pick<SupabaseClient, "rpc" | "from">; store: Pick<DataStore, "getProduct" | "getMedia">;
  supplierId: string; productId: string; userId: string; expectedRevision: number; imageIds: readonly string[];
}): Promise<Result> {
  const { db, store, supplierId, productId, userId, expectedRevision, imageIds } = input;
  const fail = (message: string, replaced = 0, requiresReload = false): Result => ({ ok: false, message, replaced, requiresReload });
  if (!UUID.test(supplierId) || !UUID.test(productId) || !userId.trim() || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      imageIds.length < 1 || imageIds.length > 8 || imageIds.some((id) => !UUID.test(id)) ||
      new Set(imageIds.map((id) => id.toLowerCase())).size !== imageIds.length) return fail("Yêu cầu xử lý ảnh không hợp lệ.");
  let revision = expectedRevision, replaced = 0;
  try {
    const product = await store.getProduct(productId);
    if (!product || product.supplier_id !== supplierId || !["draft", "changes_requested", "approved", "paused"].includes(product.supplier_review_status ?? ""))
      return fail("Sản phẩm không thuộc tài khoản hoặc đã thay đổi.", 0, true);
    const { data: draft, error: draftError } = await db.from("product_form_drafts").select("revision,base_product_updated_at,image_selection")
      .eq("product_id", productId).eq("supplier_id", supplierId).maybeSingle();
    if (draftError || !draft || draft.revision !== revision || draft.base_product_updated_at !== product.updated_at || !Array.isArray(draft.image_selection) ||
        draft.image_selection.length > 8 || imageIds.some((id) => draft.image_selection.filter((x: { source?: unknown; id?: unknown }) =>
          x?.source === "media" && typeof x.id === "string" && x.id.toLowerCase() === id.toLowerCase()).length !== 1))
      return fail("Danh sách ảnh hoặc bản nháp đã thay đổi. Hãy tải lại trang.", 0, true);
    const pattern = new RegExp(`^products/${productId.toLowerCase()}/[a-f0-9-]{20,}\\.(?:jpe?g|png|webp)$`, "i");
    const assets: MediaAsset[] = [], paths = new Set<string>();
    for (const id of imageIds) {
      const asset = await store.getMedia(id);
      if (!asset || asset.id.toLowerCase() !== id.toLowerCase() || asset.owner_type !== "product" || asset.product_id !== productId ||
          asset.supplier_id !== supplierId || asset.kind !== "image" || isExpired(asset) ||
          (asset.audience !== "buyer" && asset.created_by !== userId) || !asset.storage_path || !pattern.test(asset.storage_path) || paths.has(asset.storage_path))
        return fail("Không xác nhận được quyền hoặc đường dẫn ảnh gốc.");
      const { data: owners, error } = await db.from("media_assets").select("id").or(`storage_path.eq.${asset.storage_path},thumb_path.eq.${asset.storage_path}`);
      const { data: staged, error: stagedError } = await db.from("product_form_staged_images").select("id").or(`storage_path.eq.${asset.storage_path},thumb_path.eq.${asset.storage_path}`);
      if (error || stagedError || !Array.isArray(owners) || owners.length !== 1 || owners[0].id !== asset.id || !Array.isArray(staged) || staged.length)
        return fail("Đường dẫn ảnh gốc không có chủ sở hữu duy nhất.");
      paths.add(asset.storage_path); assets.push(asset);
    }
    for (const asset of assets) {
      const first = await getObject(asset.storage_path!);
      if (!first || !first.data.length || first.data.length > MAX_BYTES) return fail("Không đọc được ảnh gốc hoặc ảnh lớn hơn 8 MB.", replaced, replaced > 0);
      const [latestProduct, latestAsset, second] = await Promise.all([store.getProduct(productId), store.getMedia(asset.id), getObject(asset.storage_path!)]);
      if (!latestProduct || latestProduct.supplier_id !== supplierId || latestProduct.updated_at !== product.updated_at ||
          !latestAsset || JSON.stringify(latestAsset) !== JSON.stringify(asset) || !second || second.data.length > MAX_BYTES ||
          createHash("sha256").update(first.data).digest("hex") !== createHash("sha256").update(second.data).digest("hex"))
        return fail("Ảnh hoặc sản phẩm gốc đã thay đổi. Hãy tải lại trang.", replaced, true);
      const file = new File([new Uint8Array(first.data)], asset.caption?.slice(0, 150) || "anh-san-pham.webp");
      const result = await uploadPrivateProductFormImage({ db, supplierId, productId, userId, expectedRevision: revision, file,
        replaceMedia: asset as unknown as Record<string, unknown> });
      if (!result.ok) return fail(result.message, replaced, replaced > 0 || result.requiresReload === true);
      if (result.revision !== revision + 1 || result.image.source !== "staged" || !UUID.test(result.image.id))
        return fail("Không xác nhận được phiên bản ảnh. Hãy tải lại trang.", replaced, true);
      revision = result.revision; replaced++;
    }
    return { ok: true, revision, replaced };
  } catch (error) {
    console.error("[product-form] snapshot selected images", error);
    return fail("Không xác nhận được kết quả xử lý ảnh. Hãy tải lại trang.", replaced, true);
  }
}
