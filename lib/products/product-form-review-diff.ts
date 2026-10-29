import type { ProductFormDraft } from "@/lib/products/product-form-model";

export type ProductFormReviewDiff = {
  section: "basic" | "attributes" | "transaction" | "packaging" | "description";
  label: string;
  /** null means that the legacy baseline could not be represented, not an empty field. */
  previous: string | null;
  submitted: string;
  changed: boolean | null;
};

/**
 * Compare two validated form snapshots without deriving legacy tiers or grades.
 * A null baseline is deliberately unknown; callers should show the original
 * listing separately rather than suggesting the previous value was empty.
 * Photos and the reviewed English name are compared separately by the caller.
 */
export function productFormReviewDiff(baseline: ProductFormDraft | null, draft: ProductFormDraft): ProductFormReviewDiff[] {
  const text = (s: string) => s.trim();
  const yes = (b: boolean) => b ? "Có" : "Không";
  const grade = (v: ProductFormDraft) => `${text(v.grade)}${v.customGrade && v.grade.trim() ? " (tự nhập)" : ""}`;
  const tiers = (v: ProductFormDraft) => v.tiers.map((tier, i) =>
    `Mức ${i + 1}: từ ${text(tier.quantity) || "?"} ${v.unit === "mt" ? "tấn" : "kg"}, USD ${text(tier.price) || "?"}/${v.unit === "mt" ? "tấn" : "kg"}`).join("\n");
  const attributes = (v: ProductFormDraft) => Object.entries(v.attributes)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}: ${value}`).join("\n");
  const fields: Array<[ProductFormReviewDiff["section"], string, (v: ProductFormDraft) => string]> = [
    ["basic", "Tên sản phẩm", v => text(v.name)], ["basic", "Danh mục", v => text(v.category)],
    ["attributes", "Grade", grade], ["attributes", "Quy cách", v => text(v.spec)],
    ["attributes", "Vùng nguyên liệu", v => text(v.rawMaterialRegion)], ["attributes", "Nguồn gốc nguyên liệu đầu vào", v => text(v.inputMaterialOrigin)],
    ["attributes", "Thuộc tính khác", attributes],
    ["transaction", "Incoterm", v => text(v.incoterm)], ["transaction", "Địa điểm Incoterm", v => text(v.incotermPlace)],
    ["transaction", "Bảng giá theo số lượng", tiers], ["transaction", "Công khai giá", v => yes(v.pricePubliclyVisible)],
    ["transaction", "Cam kết giá", v => yes(v.priceConsent)], ["transaction", "Thanh toán", v => text(v.paymentTerms)],
    ["transaction", "OEM", v => yes(v.oem)], ["transaction", "ODM", v => yes(v.odm)], ["transaction", "Mẫu", v => yes(v.samples)],
    ["packaging", "Bao bì", v => text(v.packaging)], ["packaging", "Cảng xuất", v => text(v.exportPort)],
    ["packaging", "Thời gian giao hàng (ngày)", v => text(v.leadTimeDays)], ["packaging", "Năng lực mỗi tháng (kg)", v => text(v.monthlyCapacityKg)],
    ["description", "Mô tả ngắn", v => text(v.description)], ["description", "Mô tả chi tiết", v => text(v.descriptionDetail)],
    ["description", "Nhóm thuộc tính", v => text(v.attributePool)],
  ];
  return fields.map(([section, label, get]) => {
    const submitted = get(draft), previous = baseline ? get(baseline) : null;
    return { section, label, previous, submitted, changed: previous === null ? null : previous !== submitted };
  });
}
