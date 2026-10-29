import { isExpired } from "@/lib/media/readiness";
import { privateMediaUrl } from "@/lib/supplier-portal/product-view";
import type { MediaAsset } from "@/lib/types";
import type { ProductFormImage } from "@/lib/products/product-form-session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type DraftImageRef = { source: "media" | "staged"; id: string };
export type StagedImage = { id: string; product_id: string; supplier_id: string; created_by: string; storage_path: string; mime: string };

/** Strictly parse the stored selection; no silent skipping of a missing image. */
export function parseDraftImageSelection(raw: unknown): DraftImageRef[] | null {
  if (!Array.isArray(raw) || raw.length > 8) return null;
  const seen = new Set<string>(), result: DraftImageRef[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2 ||
        !(value.source === "media" || value.source === "staged") || typeof value.id !== "string" || !UUID.test(value.id)) return null;
    const id = value.id.toLowerCase();
    if (seen.has(id)) return null;
    seen.add(id); result.push({ source: value.source, id });
  }
  return result;
}

/**
 * Supplier-only view of a stored selection. Include deselected available photos
 * for undo, but never another user's internal file, another product or expired
 * media. The authorizing caller must obtain all rows from the same trusted DB.
 */
export function resolveSupplierDraftImages(input: {
  selection: unknown; productId: string; supplierId: string; userId: string;
  media: MediaAsset[]; staged: StagedImage[];
}): { selected: ProductFormImage[]; available: ProductFormImage[] } | null {
  const selection = parseDraftImageSelection(input.selection);
  if (!selection || !UUID.test(input.productId) || !UUID.test(input.supplierId) || !input.userId || input.staged.length > 100) return null;
  const available = new Map<string, ProductFormImage>();
  for (const asset of input.media) {
    if (!UUID.test(asset.id) || asset.owner_type !== "product" || asset.product_id !== input.productId || asset.supplier_id !== input.supplierId ||
        asset.kind !== "image" || (asset.audience !== "buyer" && asset.created_by !== input.userId) || isExpired(asset)) continue;
    const url = privateMediaUrl(asset);
    if (url) available.set(`media:${asset.id.toLowerCase()}`, { source: "media", id: asset.id.toLowerCase(), url });
  }
  for (const image of input.staged) {
    if (!UUID.test(image.id) || image.product_id !== input.productId || image.supplier_id !== input.supplierId || image.created_by !== input.userId ||
        image.mime !== "image/webp" || image.storage_path !== `products/${input.productId}/${image.id}.webp`) continue;
    available.set(`staged:${image.id.toLowerCase()}`, { source: "staged", id: image.id.toLowerCase(),
      url: `/api/product-form/images/${encodeURIComponent(input.productId)}/${encodeURIComponent(image.id)}` });
  }
  const selected: ProductFormImage[] = [];
  for (const ref of selection) {
    const image = available.get(`${ref.source}:${ref.id}`);
    if (!image) return null;
    selected.push(image);
  }
  return { selected, available: [...available.values()] };
}
