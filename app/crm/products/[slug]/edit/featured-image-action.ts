"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { isExpired } from "@/lib/media/readiness";

type Result = { ok: boolean; message: string };

/** Only staff can select a PUBLIC product-owned photo; selection cannot publish a product. */
export async function setFeaturedProductImageAction(productId: string, mediaId: string | null): Promise<Result> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  if (!/^[0-9a-f-]{36}$/i.test(productId) || (mediaId && !/^[0-9a-f-]{36}$/i.test(mediaId)))
    return { ok: false, message: "Sản phẩm hoặc ảnh không hợp lệ." };
  try {
    const store = getStore();
    const product = await store.getProduct(productId);
    if (!product) return { ok: false, message: "Không tìm thấy sản phẩm." };
    if (mediaId) {
      const asset = await store.getMedia(mediaId);
      if (!asset || asset.owner_type !== "product" || asset.product_id !== productId ||
        (asset.supplier_id && asset.supplier_id !== product.supplier_id) || asset.kind !== "image" ||
        asset.audience !== "buyer" || !asset.storage_path || isExpired(asset))
        return { ok: false, message: "Chỉ được chọn ảnh của đúng sản phẩm đã chia sẻ buyer và còn hiệu lực." };
    }
    if ((product.featured_media_id ?? null) === mediaId) return { ok: true, message: "Ảnh đại diện không thay đổi." };
    await store.updateProduct(productId, { featured_media_id: mediaId });
    const session = await getSession();
    await store.addAuditLog({ actor_id: session?.uid ?? null, actor_email: session?.email ?? null,
      entity: "product", entity_id: productId, action: "product.featured_image_changed",
      before: { featured_media_id: product.featured_media_id ?? null }, after: { featured_media_id: mediaId },
    }).catch((error) => console.error("[product-cover] audit", error));
    revalidatePath(`/crm/products/${productId}/edit`);
    revalidatePath("/products", "layout");
    return { ok: true, message: mediaId ? "Đã chọn ảnh đại diện. Sản phẩm chỉ hiện khi các điều kiện công khai khác đã đạt." : "Đã bỏ lựa chọn; hệ thống dùng ảnh chia sẻ buyer đầu tiên." };
  } catch (error) {
    console.error("[product-cover]", error);
    return { ok: false, message: "Không lưu được ảnh đại diện." };
  }
}
