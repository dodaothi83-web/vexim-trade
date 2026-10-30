"use server";

import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { uploadPrivateProductFormImage } from "@/lib/products/product-form-private-upload";
import { isSyntheticProductFormStaging } from "@/lib/products/product-form-staging-access";
import type { ProductFormImage } from "@/lib/products/product-form-session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: true; revision: number; image: ProductFormImage } | { ok: false; message: string; requiresReload?: boolean };

/**
 * Authorized private upload only. This action is not connected to a page or
 * adapter yet. A production transport for the advertised 8 MB images must be
 * verified independently of the server-action and hosting body-size limits.
 */
export async function uploadProductFormImageAction(form: FormData): Promise<Result> {
  if (!isSyntheticProductFormStaging()) return { ok: false, message: "Chức năng ảnh của form mới chưa sẵn sàng." };
  const productId = form.get("product_id"), revisionText = form.get("revision"), file = form.get("file");
  if (typeof productId !== "string" || !UUID.test(productId) || typeof revisionText !== "string" ||
      !/^[1-9]\d{0,9}$/.test(revisionText) || !Number.isSafeInteger(Number(revisionText)) || !(file instanceof File) ||
      file.size <= 0 || file.size > 8 * 1024 * 1024)
    return { ok: false, message: "Ảnh hoặc phiên bản bản nháp không hợp lệ." };
  const expectedRevision = Number(revisionText);
  try {
    const db = getSupabaseClient();
    const access = db ? await supplierPortalAccess(supabaseStore) : null;
    if (!db || !access || !portalApproved(access.supplier)) return { ok: false, message: "Không xác nhận được quyền tải ảnh." };
    const product = await supabaseStore.getProduct(productId);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    const { data: draft, error } = await db.from("product_form_drafts").select("revision,base_product_updated_at,image_selection")
      .eq("product_id", productId).eq("supplier_id", access.supplier.id).maybeSingle();
    if (error || !draft || draft.revision !== expectedRevision || draft.base_product_updated_at !== product.updated_at ||
        !["draft", "changes_requested", "approved", "paused"].includes(product.supplier_review_status ?? "") ||
        !Array.isArray(draft.image_selection) || draft.image_selection.length > 8)
      return { ok: false, requiresReload: true, message: "Bản nháp hoặc sản phẩm đã thay đổi. Hãy tải lại trang." };
    if (draft.image_selection.length === 8) return { ok: false, message: "Tối đa 8 ảnh sản phẩm." };
    return await uploadPrivateProductFormImage({ db, supplierId: access.supplier.id, productId, userId: access.user.id, expectedRevision, file });
  } catch (error) {
    console.error("[product-form] private image upload", error);
    // A network failure can occur after a storage write or committed DB RPC.
    return { ok: false, requiresReload: true, message: "Không xác nhận được kết quả tải ảnh. Hãy tải lại trang." };
  }
}
