import "server-only";

import { prepareProductFormReview } from "@/lib/products/product-form-review-preparation";
import { planProductFormPublication } from "@/lib/products/product-form-publication-plan";
import { preparePublicationImages } from "@/lib/products/product-form-promotion-images";
import { verifyPublicationImageCopies } from "@/lib/products/product-form-publication-image-verification";
import type { SupplierProduct } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Db = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Result = { ok: true; message: string } | { ok: false; message: string; requiresReload?: boolean };

/**
 * Server-only orchestration, intentionally not exposed as an action or button.
 * Caller must authorize the active reviewer before calling and enforce supplier,
 * product and buyer-cutover eligibility. SQL71 rechecks actor and exact locked
 * context atomically. Never trust a patch or image metadata from the browser.
 * Private copies can remain after an uncertain result; never blindly delete or
 * replay them. Storage privileged writes cannot be locked by this function.
 */
export async function approveProductFormAtomically(input: {
  db: Db; productId: string; submissionId: string; actorId: string; englishName: unknown;
}): Promise<Result> {
  const { db, productId, submissionId, actorId } = input;
  if (![productId, submissionId, actorId].every((value) => UUID.test(value))) return { ok: false, message: "Yêu cầu duyệt không hợp lệ." };
  let copiesMayExist = false;
  try {
    const prepared = await prepareProductFormReview(db, productId, submissionId, input.englishName);
    if (!prepared.ok) return { ok: false, message: prepared.message };
    const ctx = prepared.context, product = ctx.product, submission = ctx.submission;
    if (!object(product) || !object(submission) || product.id !== productId || submission.id !== submissionId ||
        typeof product.supplier_id !== "string" || !UUID.test(product.supplier_id) || submission.supplier_id !== product.supplier_id)
      return { ok: false, message: "Không xác nhận được chủ sở hữu bản gửi." };
    const plan = planProductFormPublication({ product: product as unknown as Pick<SupplierProduct, "specs" | "name_i18n" | "monthly_capacity">,
      validated: prepared.validation, quantity: submission.quantity });
    if (!plan.ok) return { ok: false, message: plan.reason === "legacy_grade_unmapped"
      ? "Dữ liệu grade cũ chưa thể ánh xạ an toàn. Hãy giữ nguyên sản phẩm và kiểm tra lại."
      : plan.reason === "legacy_capacity_unmapped" || plan.reason === "legacy_lead_time_unmapped"
        ? "Năng lực hoặc thời gian giao cũ chưa được ánh xạ an toàn. Hãy kiểm tra trước khi duyệt."
        : "Dữ liệu bản gửi không còn hợp lệ. Hãy tải lại trang." };
    const copies = await preparePublicationImages({ db, productId, supplierId: product.supplier_id,
      selection: submission.image_selection, snapshot: submission.image_snapshot });
    if (!copies.ok) return copies;
    copiesMayExist = true;
    if (!await verifyPublicationImageCopies({ productId, supplierId: product.supplier_id,
      selection: submission.image_selection, snapshot: submission.image_snapshot, images: copies.images }))
      return { ok: false, requiresReload: true, message: "Không xác nhận được ảnh chuẩn bị công bố. Hãy tải lại trang." };
    const { data, error } = await db.rpc("approve_product_form_submission", {
      p_product_id: productId, p_submission_id: submissionId, p_actor_id: actorId,
      p_expected_context: ctx, p_patch: plan.patch, p_images: copies.images, p_warnings: prepared.validation.warnings,
    });
    if (error || !object(data)) throw new Error("Approval result unavailable");
    if (data.status !== "approved") return { ok: false, requiresReload: true,
      message: data.status === "other_revision_pending" ? "Sản phẩm có revision giá hoặc tên khác đang xử lý. Hãy kiểm tra trước khi duyệt."
        : data.status === "category_route_changed" ? "Danh mục làm thay đổi đường dẫn hiện có. Chưa thể duyệt an toàn."
          : data.status === "supplier_unavailable" ? "Hồ sơ NCC chưa được công khai."
            : "Dữ liệu hoặc quyền đã thay đổi. Hãy tải lại trang và kiểm tra." };
    return { ok: true, message: "Đã duyệt sản phẩm." };
  } catch (error) {
    console.error("[product-form] atomic approval", error);
    return { ok: false, requiresReload: copiesMayExist, message: copiesMayExist
      ? "Không xác nhận được kết quả duyệt. Hãy tải lại trang và kiểm tra."
      : "Không kiểm tra được bản gửi. Hãy thử lại." };
  }
}
