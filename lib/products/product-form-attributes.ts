import {
  mergeAttributeFields, mergeSupplierAttributePool, sanitizeSupplierAttributePool, validateProductFields,
} from "@/lib/product-attributes";
import { isGradeFieldKey, nonGradeProductFields } from "@/lib/products/grade-pricing";
import type { ProductFormDraft } from "@/lib/products/product-form-model";
import type { Category, ProductAttributeField } from "@/lib/types";

const RESERVED = new Set(["constructor", "prototype", "tostring"]);
export type ProductFormAttributesResult = { ok: false; message: string } | { ok: true; pool: ProductAttributeField[] };

/**
 * Validate a private snapshot against current category definitions before submit
 * or approval. Unknown keys, silently truncated pool entries, grade-like keys,
 * stale hidden values and invalid select choices must never be silently dropped.
 * Does not update the category or any product.
 */
export function validateProductFormAttributes(draft: ProductFormDraft,
  category: Pick<Category, "product_fields" | "supplier_product_fields">): ProductFormAttributesResult {
  const bad = (message: string): ProductFormAttributesResult => ({ ok: false, message });
  let parsed: unknown;
  try { parsed = draft.attributePool.trim() ? JSON.parse(draft.attributePool) : []; }
  catch { return bad("Danh sách thông số không hợp lệ. Hãy kiểm tra lại."); }
  if (!Array.isArray(parsed)) return bad("Danh sách thông số không hợp lệ. Hãy kiểm tra lại.");
  const sanitized = sanitizeSupplierAttributePool(parsed);
  if (sanitized.length !== parsed.length) return bad("Một số thông số không hợp lệ. Hãy kiểm tra lại.");
  for (let i = 0; i < sanitized.length; i++) {
    const raw = parsed[i], safe = sanitized[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.key !== safe.key || raw.label !== safe.label ||
        raw.type !== safe.type || !Array.isArray(raw.options) || JSON.stringify(raw.options) !== JSON.stringify(safe.options) ||
        isGradeFieldKey(safe.key) || RESERVED.has(safe.key))
      return bad("Một số thông số không hợp lệ. Hãy kiểm tra lại.");
  }
  let official: ProductAttributeField[];
  try { official = nonGradeProductFields(validateProductFields(category.product_fields ?? [])); }
  catch { return bad("Cấu hình thông số của danh mục không hợp lệ."); }
  const pool = nonGradeProductFields(mergeSupplierAttributePool(category.supplier_product_fields, sanitized));
  for (const field of sanitized) {
    const merged = pool.find((item) => item.key === field.key);
    if (!merged || field.options.some((option) => !merged.options.includes(option)))
      return bad("Danh mục đã đủ số thông số hoặc lựa chọn. Hãy kiểm tra lại.");
  }
  const fields = mergeAttributeFields(official, pool);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(draft.attributes)) {
    const field = byKey.get(key);
    if (!field || isGradeFieldKey(key) || RESERVED.has(key) || value.length > 200)
      return bad("Thông số không còn thuộc danh mục hoặc vượt giới hạn. Hãy kiểm tra lại.");
    if (value && field.type === "select" && !field.options.includes(value))
      return bad(`Giá trị của ${field.label} không còn hợp lệ. Hãy kiểm tra lại.`);
    if (value && field.showWhen && draft.attributes[field.showWhen.key] !== field.showWhen.value)
      return bad(`Hãy xóa giá trị của ${field.label} trước khi thay đổi lựa chọn liên quan.`);
  }
  return { ok: true, pool };
}
