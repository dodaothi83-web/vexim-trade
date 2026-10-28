"use server";

import { updateMediaAction } from "@/app/actions";
import { guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { isExpired } from "@/lib/media/readiness";

/** Mark only selected photos of this product as checked. Audience and cover stay unchanged. */
export async function checkProductImagesAction(productId: string, ids: string[]): Promise<{
  checked: string[];
  failed: { id: string; message: string }[];
}> {
  const failAll = (message: string) => ({ checked: [], failed: Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").map((id) => ({ id, message })) : [] });
  const denied = await guard("media.manage");
  if (denied) return failAll(denied.message ?? "Không có quyền kiểm tra ảnh.");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(productId) || !Array.isArray(ids) || ids.length === 0 || ids.length > 100 || ids.some((id) => typeof id !== "string" || !uuid.test(id)) || new Set(ids).size !== ids.length) {
    return { checked: [], failed: Array.isArray(ids) ? ids.map((id) => ({ id, message: "Danh sách ảnh không hợp lệ." })) : [] };
  }
  const checked: string[] = [];
  const failed: { id: string; message: string }[] = [];
  try {
    const store = getStore();
    const product = await store.getProduct(productId);
    if (!product) return failAll("Không tìm thấy sản phẩm.");
    for (const id of ids) {
      try {
        const image = await store.getMedia(id);
        if (!image || image.owner_type !== "product" || image.product_id !== productId ||
            image.supplier_id !== product.supplier_id || image.kind !== "image" || !image.storage_path || isExpired(image)) {
          failed.push({ id, message: "Ảnh không còn hợp lệ hoặc không thuộc sản phẩm này." });
          continue;
        }
        if (image.status === "checked") { checked.push(id); continue; }
        const result = await updateMediaAction(id, { status: "checked" });
        if (result.ok) checked.push(id);
        else failed.push({ id, message: result.message });
      } catch {
        failed.push({ id, message: "Không kiểm tra được ảnh. Vui lòng thử lại." });
      }
    }
  } catch {
    return failAll("Không đọc được sản phẩm. Vui lòng thử lại.");
  }
  return { checked, failed };
}
