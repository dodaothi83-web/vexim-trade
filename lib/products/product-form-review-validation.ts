import "server-only";

import { parseProductFormDraft, validateProductFormSubmission, type ProductFormDraft, type ProductFormIssue } from "@/lib/products/product-form-model";
import { validateProductFormAttributes } from "@/lib/products/product-form-attributes";
import type { Category } from "@/lib/types";
import { sanitizeProductDescriptionForSave } from "@/lib/products/product-description";
import { nameContainsGrade, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import { toQuantityRevisionV2 } from "@/lib/products/quantity-revision-v2";

export type ProductFormReviewValidation =
  | { ok: false; message: string; errors?: ProductFormIssue[] }
  | { ok: true; draft: ProductFormDraft; englishName: string; warnings: ProductFormIssue[] };

/** Canonical JSON comparison independent of PostgreSQL JSONB object-key order. */
function canonicalJson(input: unknown): string | undefined {
  return JSON.stringify(input, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
}

/**
 * Recheck a stored immutable submission against the current category and policy
 * before staff approve it. This is not an approval transaction: the caller must
 * also lock the product and recheck the exact submission, policy, image snapshot
 * and relevant name/grade revisions atomically before changing public data.
 */
export function validateProductFormForReview(input: {
  payload: unknown; quantity: unknown; englishName: unknown; categoryValid: boolean;
  category: Pick<Category, "product_fields" | "supplier_product_fields"> | null;
  imageCount: number; standardGrades: readonly string[]; policy: QuantityPricingPolicy | null;
}): ProductFormReviewValidation {
  const draft = parseProductFormDraft(input.payload);
  if (!draft) return { ok: false, message: "Dữ liệu bản gửi không hợp lệ." };
  try {
    if (sanitizeProductDescriptionForSave(draft.descriptionDetail) !== draft.descriptionDetail)
      return { ok: false, message: "Mô tả chi tiết chưa có định dạng an toàn." };
  } catch { return { ok: false, message: "Mô tả chi tiết chưa có định dạng an toàn." }; }
  if (input.categoryValid) {
    if (!input.category) return { ok: false, message: "Không tải được cấu hình thông số của danh mục." };
    const attributes = validateProductFormAttributes(draft, input.category);
    if (!attributes.ok) return { ok: false, message: attributes.message,
      errors: [{ section: "attributes", field: "attributes", code: "attributes", message: attributes.message }] };
  }
  const validation = validateProductFormSubmission(draft, {
    categoryValid: input.categoryValid, imageCount: input.imageCount, standardGrades: input.standardGrades, policy: input.policy,
  });
  if (validation.errors.length || !validation.quantity)
    return { ok: false, message: "Bản gửi không còn đáp ứng điều kiện duyệt.", errors: validation.errors };
  const expected = { grade: validation.quantity.grade, incoterm: validation.quantity.incoterm, tiers: toQuantityRevisionV2(validation.quantity) };
  if (canonicalJson(input.quantity) !== canonicalJson(expected))
    return { ok: false, message: "Bảng giá trong bản gửi không khớp dữ liệu đã kiểm tra." };
  if (typeof input.englishName !== "string" || !input.englishName.trim() || input.englishName.trim().length > 180)
    return { ok: false, message: "Nhập tên sản phẩm tiếng Anh hợp lệ." };
  const englishName = input.englishName.trim();
  if (nameContainsGrade(englishName, [...input.standardGrades, validation.quantity.grade]))
    return { ok: false, message: "Không ghi grade trong tên sản phẩm tiếng Anh." };
  return { ok: true, draft, englishName, warnings: validation.warnings };
}
