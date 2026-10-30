"use server";

import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { isProductFormEnabled } from "@/lib/products/product-form-staging-access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ImageRef = { source: "media" | "staged"; id: string };
type Result = { ok: true; revision: number } | { ok: false; message: string; requiresReload?: boolean };

/** Change only the private selection; the database locks the product and draft. */
export async function setProductFormImagesAction(productId: string, expectedRevision: number, input: unknown): Promise<Result> {
  if (!isProductFormEnabled()) return { ok: false, message: "Chức năng ảnh của form mới chưa sẵn sàng." };
  if (!UUID.test(productId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      !Array.isArray(input) || input.length > 8) return { ok: false, message: "Danh sách ảnh không hợp lệ." };
  const refs: ImageRef[] = [];
  const keys = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2 ||
        !["media", "staged"].includes(value.source) || typeof value.id !== "string" || !UUID.test(value.id))
      return { ok: false, message: "Danh sách ảnh không hợp lệ." };
    const key = value.id.toLowerCase();
    if (keys.has(key)) return { ok: false, message: "Danh sách ảnh không hợp lệ." };
    keys.add(key);
    refs.push({ source: value.source, id: value.id.toLowerCase() });
  }
  try {
    const db = getSupabaseClient();
    const access = db ? await supplierPortalAccess(supabaseStore) : null;
    if (!db || !access || !portalApproved(access.supplier)) return { ok: false, message: "Không xác nhận được quyền quản lý ảnh." };
    const product = await supabaseStore.getProduct(productId);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    const { data, error } = await db.rpc("set_product_form_images", {
      p_supplier_id: access.supplier.id, p_product_id: productId, p_user_id: access.user.id,
      p_staff: false, p_expected_revision: expectedRevision, p_selection: refs,
    });
    if (error) throw error;
    if (data?.status === "saved" && Number.isSafeInteger(data.revision) && data.revision >= expectedRevision && data.revision <= expectedRevision + 1)
      return { ok: true, revision: data.revision };
    if (data?.status === "image_limit") return { ok: false, message: "Tối đa 8 ảnh sản phẩm." };
    if (data?.status === "invalid") return { ok: false, message: "Danh sách ảnh không hợp lệ." };
    return { ok: false, requiresReload: true, message: "Ảnh hoặc sản phẩm đã thay đổi. Hãy tải lại trang." };
  } catch (error) {
    console.error("[product-form] image selection", error);
    // A network error does not prove that the database transaction failed.
    return { ok: false, requiresReload: true, message: "Không xác nhận được danh sách ảnh. Hãy tải lại trang." };
  }
}
