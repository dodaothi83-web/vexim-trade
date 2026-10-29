"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { readQuantityPricingPolicy } from "@/lib/products/quantity-price-config";
import { parseProductFormDraft, validateProductFormSubmission, type ProductFormIssue } from "@/lib/products/product-form-model";
import { validateProductFormAttributes } from "@/lib/products/product-form-attributes";
import { sanitizeProductDescriptionForSave } from "@/lib/products/product-description";
import { toQuantityRevisionV2 } from "@/lib/products/quantity-revision-v2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SubmitResult = { ok: false; message: string; errors?: ProductFormIssue[]; requiresReload?: boolean } |
  { ok: true; message: string; submissionId: string; warnings: ProductFormIssue[] };

/** Validate against trusted category, policy and images, then submit an exact persisted draft. */
export async function submitProductFormDraftAction(productId: string, expectedRevision: number): Promise<SubmitResult> {
  if (!UUID.test(productId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    return { ok: false, message: "Phiên bản bản nháp không hợp lệ." };
  try {
    const db = getSupabaseClient();
    const access = db ? await supplierPortalAccess(supabaseStore) : null;
    if (!db || !access || !portalApproved(access.supplier)) return { ok: false, message: "Không xác nhận được quyền gửi sản phẩm." };
    const product = await supabaseStore.getProduct(productId);
    if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: "Sản phẩm không thuộc tài khoản của bạn." };
    const { data: stored, error } = await db.from("product_form_drafts").select("revision,payload,image_selection")
      .eq("product_id", productId).eq("supplier_id", access.supplier.id).maybeSingle();
    if (error || !stored) return { ok: false, message: "Không tải được bản nháp. Hãy lưu lại trước khi gửi." };
    const draft = parseProductFormDraft(stored.payload);
    if (!draft || stored.revision !== expectedRevision) return { ok: false, message: "Bản nháp đã thay đổi. Hãy tải lại trang." };
    // Never publish unfiltered HTML, including rows introduced outside this UI.
    if (sanitizeProductDescriptionForSave(draft.descriptionDetail) !== draft.descriptionDetail)
      return { ok: false, message: "Mô tả chi tiết cần được lưu lại để kiểm tra định dạng an toàn." };
    const category = draft.category ? await supabaseStore.getCategoryBySlug(draft.category) : null;
    const categoryValid = !!category && category.status === "published" && category.is_published === true;
    if (categoryValid && category) {
      const attributes = validateProductFormAttributes(draft, category);
      if (!attributes.ok) return { ok: false, message: attributes.message,
        errors: [{ section: "attributes", field: "attributes", code: "attributes", message: attributes.message }] };
    }
    // The RPC checks ownership, visibility, duplicates, expiration and path
    // collisions under the product lock. Never enumerate all public media as a
    // substitute for the user's private ordered selection.
    const selection: unknown = stored.image_selection;
    if (!Array.isArray(selection) || selection.length > 8)
      return { ok: false, message: "Danh sách ảnh không hợp lệ. Hãy tải lại trang." };
    const policy = categoryValid ? await readQuantityPricingPolicy(category.id) : null;
    const validated = validateProductFormSubmission(draft, {
      categoryValid, imageCount: selection.length, standardGrades: categoryValid ? standardGradesForCategory(category) : [], policy,
    });
    if (validated.errors.length || !validated.quantity) return {
      ok: false, message: "Vui lòng hoàn thiện các thông tin bắt buộc trước khi gửi duyệt.", errors: validated.errors,
    };
    const quantity = { grade: validated.quantity.grade, incoterm: validated.quantity.incoterm,
      tiers: toQuantityRevisionV2(validated.quantity) };
    const { data, error: submitError } = await db.rpc("submit_product_form_draft_selected_images", {
      p_supplier_id: access.supplier.id, p_product_id: productId, p_user_id: access.user.id, p_staff: false,
      p_expected_revision: expectedRevision, p_validated_payload: draft, p_quantity: quantity,
      p_warnings: validated.warnings, p_selection: selection,
    });
    if (submitError) throw new Error(submitError.message);
    if (!data || data.status !== "submitted" || typeof data.submission_id !== "string" || !UUID.test(data.submission_id)) {
      if (data?.status === "images_changed") return { ok: false, requiresReload: true, message: "Ảnh sản phẩm đã thay đổi. Hãy tải lại để kiểm tra trước khi gửi." };
      if (data?.status === "already_pending") return { ok: false, requiresReload: true, message: "Sản phẩm đã có bản đang chờ duyệt. Hãy tải lại trang." };
      if (data?.status === "already_decided") return { ok: false, requiresReload: true, message: "Bản gửi này đã được xử lý. Hãy tải lại trang." };
      return { ok: false, requiresReload: true, message: "Dữ liệu hoặc trạng thái sản phẩm đã thay đổi. Hãy tải lại trang." };
    }
    revalidatePath(`/supplier/portal/products/${productId}`);
    revalidatePath("/supplier/portal/products");
    revalidatePath("/crm/products");
    return { ok: true, message: "Đã gửi sản phẩm để Vexim kiểm tra.", submissionId: data.submission_id, warnings: validated.warnings };
  } catch (error) {
    console.error("[product-form] submit", error);
    return { ok: false, requiresReload: true, message: "Không xác nhận được kết quả gửi. Hãy tải lại trang để kiểm tra." };
  }
}
