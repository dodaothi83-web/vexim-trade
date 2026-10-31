import { deleteObject, getObject, putObject } from "@/lib/media/storage";
import type { DataStore } from "@/lib/db/types";
import type { MediaAsset } from "@/lib/types";

/**
 * Ảnh trong kho ảnh nằm ở namespace riêng `supplier-media/` — cố ý không phục vụ công khai:
 * `/public-media` chặn namespace này và `/api/media/file` chỉ mở cho người đã tải lên.
 *
 * Vì vậy ảnh gắn vào sản phẩm phải được chép sang `products/<product_id>/` và phải giữ
 * `supplier_id` của nhà cung cấp. Bản cũ của bước gắn ảnh làm sai cả hai điều đó: nó đặt
 * `supplier_id = null` (nên `supplierVisibleProductMedia` lọc mất ảnh ngay sau khi bấm Lưu,
 * dù tệp vẫn còn) và để tệp trong `supplier-media/` (nên người mua không tải được).
 */
export const BANK_MEDIA_PREFIX = "supplier-media/";

/**
 * Chép một ảnh từ kho ảnh sang thư mục của sản phẩm.
 * Chép hỏng thì trả `null` để ảnh ở nguyên trong kho — người bán không mất ảnh.
 */
export async function moveBankImageIntoProduct(asset: MediaAsset, productId: string):
  Promise<{ storage_path: string; thumb_path: string | null } | null> {
  const source = asset.storage_path ?? "";
  if (!source.startsWith(BANK_MEDIA_PREFIX)) return null;
  const extension = /\.([a-z0-9]+)$/i.exec(source)?.[1]?.toLowerCase() ?? "webp";
  // Đặt tên theo mã ảnh để lần sửa sau ghi đè đúng chỗ, không sinh bản sao mồ côi.
  const base = `products/${productId}/${asset.id}`;
  try {
    const object = await getObject(source);
    if (!object) return null;
    const storagePath = `${base}.${extension}`;
    await putObject(storagePath, object.data, asset.mime || "image/webp");
    let thumbPath: string | null = null;
    if (asset.thumb_path) {
      const thumb = await getObject(asset.thumb_path).catch(() => null);
      if (thumb) {
        const candidate = `${base}-thumb.webp`;
        thumbPath = await putObject(candidate, thumb.data, "image/webp")
          .then(() => candidate)
          .catch((error) => { console.error("[supplier-product] bank thumb copy", asset.id, error); return null; });
      }
    }
    return { storage_path: storagePath, thumb_path: thumbPath };
  } catch (error) {
    console.error("[supplier-product] bank image copy", asset.id, error);
    return null;
  }
}

/** Dọn bản gốc trong kho ảnh sau khi bản sao ở thư mục sản phẩm đã được ghi vào CSDL. */
export async function removeBankOriginals(asset: MediaAsset) {
  await Promise.all([asset.storage_path, asset.thumb_path]
    .filter((path): path is string => !!path && path.startsWith(BANK_MEDIA_PREFIX))
    .map((path) => deleteObject(path).catch((error) => console.error("[supplier-product] bank copy cleanup", path, error))));
}

/**
 * Sửa những ảnh đã gắn vào sản phẩm nhưng còn thiếu `supplier_id` hoặc còn nằm trong
 * `supplier-media/`. Trả về danh sách ảnh đã cập nhật để trang gọi dùng ngay, không phải
 * tải lại; ảnh không cần sửa thì giữ nguyên, không tốn thao tác Storage nào.
 */
export async function repairAttachedBankMedia(
  store: DataStore,
  supplierId: string,
  media: MediaAsset[],
): Promise<MediaAsset[]> {
  const broken = media.filter((asset) => asset.owner_type === "product" && !!asset.product_id &&
    (asset.supplier_id !== supplierId || (asset.storage_path ?? "").startsWith(BANK_MEDIA_PREFIX)));
  if (!broken.length) return media;
  const repaired = new Map<string, MediaAsset>();
  for (const asset of broken) {
    const productId = asset.product_id!;
    const stillInBank = (asset.storage_path ?? "").startsWith(BANK_MEDIA_PREFIX);
    try {
      const moved = stillInBank ? await moveBankImageIntoProduct(asset, productId) : null;
      if (stillInBank && !moved) continue; // chép hỏng: giữ nguyên tệp, lần sau thử lại
      const updated = await store.updateMedia(asset.id, {
        supplier_id: supplierId,
        ...(moved ? { storage_path: moved.storage_path, thumb_path: moved.thumb_path } : {}),
      });
      if (moved) await removeBankOriginals(asset);
      repaired.set(asset.id, { ...asset, ...updated });
    } catch (error) {
      console.error("[supplier-product] repair attached bank media", asset.id, productId, error);
    }
  }
  return media.map((asset) => repaired.get(asset.id) ?? asset);
}
