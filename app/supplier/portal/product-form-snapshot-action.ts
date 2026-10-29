"use server";

import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { snapshotSelectedProductImages } from "@/lib/products/product-form-snapshot-images";

/** Supplier-only authorization boundary; not yet connected to a page. */
export async function snapshotProductFormImagesAction(productId: string, revision: number, imageIds: string[]) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof productId !== "string" || !uuid.test(productId) || !Number.isSafeInteger(revision) || revision < 1 || !Array.isArray(imageIds) ||
      imageIds.length < 1 || imageIds.length > 8 || imageIds.some((id) => typeof id !== "string" || !uuid.test(id)))
    return { ok: false as const, message: "Yêu cầu xử lý ảnh không hợp lệ.", replaced: 0 };
  try {
    const db = getSupabaseClient();
    const access = db ? await supplierPortalAccess(supabaseStore) : null;
    if (!db || !access || !portalApproved(access.supplier))
      return { ok: false as const, message: "Không xác nhận được quyền xử lý ảnh.", replaced: 0 };
    const product = await supabaseStore.getProduct(productId);
    if (!product || product.supplier_id !== access.supplier.id)
      return { ok: false as const, message: "Sản phẩm không thuộc tài khoản của bạn.", replaced: 0 };
    return await snapshotSelectedProductImages({ db, store: supabaseStore, supplierId: access.supplier.id, productId,
      userId: access.user.id, expectedRevision: revision, imageIds });
  } catch (error) {
    console.error("[product-form] snapshot selected images action", error);
    return { ok: false as const, message: "Không xác nhận được kết quả xử lý ảnh. Hãy tải lại trang.", replaced: 0, requiresReload: true };
  }
}
