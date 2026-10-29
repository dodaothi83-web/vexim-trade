import "server-only";

import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { parseGradeBounds, parseQuantityPriceSettings, settingsToPolicy } from "@/lib/products/quantity-price-settings";
import { validateProductFormForReview, type ProductFormReviewValidation } from "@/lib/products/product-form-review-validation";
import { verifyStagedReviewImages } from "@/lib/products/product-form-review-images";
import type { Category } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
type Db = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Result = { ok: false; message: string } | {
  ok: true; context: Record<string, unknown>;
  validation: Extract<ProductFormReviewValidation, { ok: true }>;
};

/**
 * Obtain one coherent DB snapshot and validate its form, policy, English title
 * and staged bytes. The caller must first authorize staff. This does not approve:
 * SQL65 locks end with the RPC. A future approval transaction must call that
 * helper again and compare the entire context with this exact returned JSONB,
 * as well as preventing storage mutation after the byte check.
 */
export async function prepareProductFormReview(db: Db, productId: string, submissionId: string, englishName: unknown): Promise<Result> {
  if (!UUID.test(productId) || !UUID.test(submissionId)) return { ok: false, message: "Bản gửi không hợp lệ." };
  try {
    const { data, error } = await db.rpc("product_form_review_context", { p_product_id: productId, p_submission_id: submissionId });
    if (error || !object(data) || data.status !== "ok" || !object(data.product) || !object(data.submission) ||
        !object(data.category) || !object(data.settings) || !Array.isArray(data.bounds) || data.bounds.length > 1000 ||
        !Array.isArray(data.prices) || !Array.isArray(data.names))
      return { ok: false, message: "Không xác nhận được dữ liệu duyệt. Hãy tải lại trang." };
    const item = data.product, submission = data.submission, category = data.category, settingsRow = data.settings;
    if (item.id !== productId.toLowerCase() || typeof item.supplier_id !== "string" || !UUID.test(item.supplier_id) ||
        submission.id !== submissionId.toLowerCase() || submission.product_id !== item.id || submission.supplier_id !== item.supplier_id ||
        submission.status !== "pending" || category.status !== "published" || category.is_published !== true ||
        typeof category.id !== "string" || !UUID.test(category.id) || typeof category.slug !== "string" || settingsRow.singleton !== true ||
        !object(submission.payload) || submission.payload.category !== category.slug || !Array.isArray(submission.image_selection) ||
        !Array.isArray(submission.image_snapshot)) return { ok: false, message: "Dữ liệu duyệt không hợp lệ." };
    const form = new FormData();
    for (const [key, value] of Object.entries(settingsRow)) {
      if (typeof value === "number" || typeof value === "string") form.set(key, String(value));
    }
    const settings = parseQuantityPriceSettings(form);
    if (!settings) return { ok: false, message: "Cấu hình bảng giá không hợp lệ." };
    const bounds: Record<string, { minUsdPerKg: number; maxUsdPerKg: number }> = Object.create(null);
    const seen = new Set<string>();
    for (const value of data.bounds) {
      if (!object(value) || value.category_id !== category.id || typeof value.grade !== "string" || !value.grade.trim())
        return { ok: false, message: "Ngưỡng giá grade không hợp lệ." };
      const key = value.grade.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
      if (seen.has(key)) return { ok: false, message: "Ngưỡng giá grade bị trùng." };
      seen.add(key);
      const gradeForm = new FormData();
      gradeForm.set("min_usd_per_kg", String(value.min_usd_per_kg ?? ""));
      gradeForm.set("max_usd_per_kg", String(value.max_usd_per_kg ?? ""));
      const parsed = parseGradeBounds(gradeForm);
      if (!parsed.ok || !parsed.bounds) return { ok: false, message: "Ngưỡng giá grade không hợp lệ." };
      bounds[value.grade] = { minUsdPerKg: parsed.bounds.min_usd_per_kg, maxUsdPerKg: parsed.bounds.max_usd_per_kg };
    }
    const categoryData = category as unknown as Category;
    const validation = validateProductFormForReview({ payload: submission.payload, quantity: submission.quantity,
      englishName, categoryValid: true, category: categoryData, imageCount: submission.image_selection.length,
      standardGrades: standardGradesForCategory(categoryData), policy: settingsToPolicy(settings, bounds) });
    if (!validation.ok) return { ok: false, message: validation.message };
    const images = await verifyStagedReviewImages({ productId: item.id as string, supplierId: item.supplier_id,
      selection: submission.image_selection, snapshot: submission.image_snapshot });
    if (!images.ok) return { ok: false, message: images.reason === "existing_media_unverified"
      ? "Ảnh cũ cần được xử lý an toàn trước khi duyệt." : "Ảnh đã đổi hoặc không thể kiểm tra. Hãy tải lại trang." };
    return { ok: true, context: data, validation };
  } catch (error) {
    console.error("[product-form] review preparation", error);
    return { ok: false, message: "Không kiểm tra được bản gửi. Hãy thử lại." };
  }
}
