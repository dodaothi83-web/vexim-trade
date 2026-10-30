import { z } from "zod";
import { validateSupplierQuantityEntry, type SupplierQuantityEntryResult } from "@/lib/products/quantity-entry";
import type { QuantityPricingIssue, QuantityPricingPolicy } from "@/lib/products/quantity-pricing";

/**
 * One private form contract for supplier and staff. Values remain strings while
 * editing so an incomplete draft, including an unfinished number, can be saved.
 * Completeness is checked only for submission. The server must obtain the image
 * count, category and policy independently instead of trusting the browser.
 */
const small = (max: number) => z.string().max(max);
const tierSchema = z.object({ quantity: small(32), price: small(32) }).strict();
export const productFormDraftSchema = z.object({
  name: small(180),
  category: small(180),
  grade: small(80),
  customGrade: z.boolean(),
  spec: small(800),
  rawMaterialRegion: small(180),
  inputMaterialOrigin: small(300),
  incoterm: small(20),
  incotermPlace: small(100),
  unit: z.enum(["kg", "mt"]),
  tiers: z.array(tierSchema).max(4),
  pricePubliclyVisible: z.boolean(),
  priceConsent: z.boolean(),
  paymentTerms: small(200),
  oem: z.boolean(),
  odm: z.boolean(),
  samples: z.boolean(),
  packaging: small(300),
  exportPort: small(120),
  leadTimeDays: small(5),
  monthlyCapacityKg: small(32),
  description: small(1500),
  descriptionDetail: small(40000),
  // Existing category-specific attributes and supplier-added attribute choices.
  attributes: z.record(small(100), small(2000)).refine((values) => Object.keys(values).length <= 100),
  attributePool: small(8000),
}).strict();
export type ProductFormDraft = z.infer<typeof productFormDraftSchema>;
export type ProductFormSection = "basic" | "attributes" | "transaction" | "packaging" | "description";
export type ProductFormIssue = { section: ProductFormSection; field: string; code: string; message: string; tierIndex?: number };
export type ProductFormValidation = {
  errors: ProductFormIssue[];
  warnings: ProductFormIssue[];
  quantity: SupplierQuantityEntryResult["value"];
};

/** Structural validation only. A valid draft is not necessarily ready to submit. */
export function parseProductFormDraft(input: unknown): ProductFormDraft | null {
  const parsed = productFormDraftSchema.safeParse(input);
  if (!parsed.success) return null;
  // JSONB adds whitespace to its text representation; leave room below the DB's 64 KiB limit.
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > 60_000) return null;
  return parsed.data;
}

const DRAFT_FIELD_LABELS: Record<string, string> = {
  name: "Tên sản phẩm", category: "Danh mục", grade: "Grade", customGrade: "Grade",
  spec: "Quy cách / tiêu chuẩn", rawMaterialRegion: "Vùng nguyên liệu", inputMaterialOrigin: "Xuất xứ nguyên liệu",
  incoterm: "Incoterm", incotermPlace: "Địa điểm Incoterm", unit: "Đơn vị số lượng", tiers: "Giá theo số lượng",
  pricePubliclyVisible: "Hiện giá", priceConsent: "Cam kết giá", paymentTerms: "Điều kiện thanh toán",
  oem: "OEM", odm: "ODM", samples: "Mẫu", packaging: "Bao bì", exportPort: "Cảng xuất",
  leadTimeDays: "Thời gian giao hàng", monthlyCapacityKg: "Năng lực cung cấp", description: "Mô tả ngắn",
  descriptionDetail: "Mô tả chi tiết", attributes: "Thuộc tính sản phẩm", attributePool: "Thuộc tính sản phẩm",
};

/** Explain structural rejection without logging or returning any supplied values. */
export function productFormDraftStructureError(input: unknown): string | null {
  const parsed = productFormDraftSchema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => {
      const key = issue.path[0];
      return typeof key === "string" && Object.hasOwn(DRAFT_FIELD_LABELS, key) ? DRAFT_FIELD_LABELS[key] : null;
    }).filter((label): label is string => label !== null))];
    return fields.length ? `Dữ liệu bản nháp không hợp lệ tại: ${fields.join(", ")}. Hãy kiểm tra nội dung và độ dài.` :
      "Dữ liệu bản nháp không hợp lệ. Hãy tải lại trang hoặc liên hệ hỗ trợ.";
  }
  if (new TextEncoder().encode(JSON.stringify(parsed.data)).length > 60_000)
    return "Dữ liệu bản nháp quá dài. Hãy giảm bớt nội dung rồi thử lại.";
  return null;
}

function quantityIssue(issue: QuantityPricingIssue): ProductFormIssue {
  const section: ProductFormSection = issue.code === "grade" ? "attributes" : issue.code === "name_vi_grade" ? "basic" : "transaction";
  const field = issue.code === "grade" ? "grade" : issue.code === "name_vi_grade" ? "name" : issue.code === "incoterm" ? "incoterm" : "tiers";
  return { section, field, code: issue.code, message: issue.message, ...(issue.tierIndex === undefined ? {} : { tierIndex: issue.tierIndex }) };
}

/** kg/month accepts digits and correctly grouped thousands, not package units. */
function validCapacity(value: string): boolean {
  const raw = value.trim();
  if (!raw) return true;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) return false;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isSafeInteger(n) && n > 0 && n <= 1_000_000_000;
}

export function validateProductFormSubmission(
  draft: ProductFormDraft,
  context: { categoryValid: boolean; imageCount: number; standardGrades: readonly string[]; policy: QuantityPricingPolicy | null },
): ProductFormValidation {
  const errors: ProductFormIssue[] = [];
  const warnings: ProductFormIssue[] = [];
  const add = (section: ProductFormSection, field: string, code: string, message: string) => errors.push({ section, field, code, message });
  if (draft.name.trim().length < 3) add("basic", "name", "name", "Tên sản phẩm cần ít nhất 3 ký tự.");
  if (!draft.category.trim() || !context.categoryValid) add("basic", "category", "category", "Chọn danh mục đang được xuất bản.");
  if (!Number.isInteger(context.imageCount) || context.imageCount < 1 || context.imageCount > 8)
    add("basic", "images", "images", "Tải từ 1 đến 8 ảnh sản phẩm.");
  if (!draft.incotermPlace.trim()) add("transaction", "incotermPlace", "incoterm_place", "Nhập địa điểm Incoterm.");
  if (draft.pricePubliclyVisible && !draft.priceConsent) add("transaction", "priceConsent", "consent", "Hãy xác nhận cam kết giá trước khi công khai.");
  if (draft.leadTimeDays.trim() && (!/^\d+$/.test(draft.leadTimeDays.trim()) || Number(draft.leadTimeDays) < 1 || Number(draft.leadTimeDays) > 3650))
    add("packaging", "leadTimeDays", "lead_time", "Nhập thời gian giao hàng hợp lệ theo ngày.");
  if (!validCapacity(draft.monthlyCapacityKg)) add("packaging", "monthlyCapacityKg", "capacity", "Nhập năng lực hợp lệ theo kg mỗi tháng.");
  if (!draft.description.trim() && !draft.spec.trim()) add("description", "description", "description_or_spec", "Nhập mô tả ngắn hoặc quy cách sản phẩm.");
  if (!context.policy) {
    add("transaction", "tiers", "missing_policy", "Chưa tải được cấu hình bảng giá. Vui lòng thử lại.");
    return { errors, warnings, quantity: null };
  }
  const quantity = validateSupplierQuantityEntry({ nameVi: draft.name, grade: draft.grade, customGrade: draft.customGrade,
    incoterm: draft.incoterm, unit: draft.unit, tiers: draft.tiers }, context.standardGrades, context.policy);
  errors.push(...quantity.errors.map(quantityIssue));
  warnings.push(...quantity.warnings.map(quantityIssue));
  return { errors, warnings, quantity: quantity.value };
}
