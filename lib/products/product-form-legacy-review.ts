import type { SupplierProduct } from "@/lib/types";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

/** A suggestion is not a reviewed category; it must never authorize publication. */
export function legacyCategoryForComparison(product: Pick<SupplierProduct, "category" | "reviewed_category_slug">,
  options: readonly CategoryProposalOption[]): { category: CategoryProposalOption | null; source: "reviewed" | "suggested" | "missing" } {
  const reviewed = typeof product.reviewed_category_slug === "string" ? product.reviewed_category_slug.trim() : "";
  const legacy = typeof product.category === "string" ? product.category.trim() : "";
  // Never replace an explicit but unavailable reviewed category with a guess.
  const candidate = reviewed || legacy;
  const matches = candidate ? options.filter((option) => option.slug === candidate) : [];
  return matches.length === 1 ? { category: matches[0], source: reviewed ? "reviewed" : "suggested" } : { category: null, source: "missing" };
}

export type LegacyReviewEvidence = { label: string; lines: string[]; instruction: string };
const line = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const amount = (value: unknown): string | null => typeof value === "number" && Number.isFinite(value) ? String(value) : line(value);
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/**
 * Present potentially competing source values for human confirmation. This is
 * not a conflict detector, unit conversion, reconciliation or approval. It must
 * not silently assign values to a draft; raw data remains on the original row.
 */
export function legacyProductReviewEvidence(product: SupplierProduct, gradeRow: unknown): LegacyReviewEvidence[] {
  const specLines = (product.spec ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const matching = (pattern: RegExp) => specLines.filter((text) => pattern.test(text)).slice(0, 3).map((text) => text.slice(0, 240));
  const specs = object(product.specs), row = object(gradeRow), lead = object(specs?.lead_time);
  const result: LegacyReviewEvidence[] = [];
  const leadValues: string[] = [];
  if (Number.isSafeInteger(product.lead_time_days) && (product.lead_time_days ?? 0) > 0) leadValues.push(`Trường thời gian: ${product.lead_time_days} ngày`);
  const leadValue = amount(lead?.value), leadUnit = line(lead?.unit);
  if (leadValue || leadUnit) leadValues.push(`Thông số thời gian gốc: ${[leadValue, leadUnit].filter(Boolean).join(" ")}`);
  leadValues.push(...matching(/thời\s*gian\s*(?:giao|vận)|delivery\s*time/i).map((s) => `Quy cách: ${s}`));
  if (leadValues.length) result.push({ label: "Thời gian giao hàng", lines: leadValues,
    instruction: "Kiểm tra các cách ghi và xác nhận thời gian chính thức; không tự chọn giữa ngày thường và ngày làm việc." });

  const moqValues: string[] = [];
  const originalMoq = line(product.moq); if (originalMoq) moqValues.push(`MOQ gốc: ${originalMoq}`);
  const quantity = amount(product.moq_qty), unit = line(product.moq_unit);
  if (quantity || unit) moqValues.push(`Số lượng/đơn vị gốc: ${[quantity, unit].filter(Boolean).join(" ")}`);
  const gradeMoq = line(row?.moq), gradeQty = amount(row?.moq_qty), gradeUnit = line(row?.moq_unit);
  if (gradeMoq && gradeMoq !== originalMoq) moqValues.push(`MOQ của grade: ${gradeMoq}`);
  if ((gradeQty || gradeUnit) && (gradeQty !== quantity || gradeUnit !== unit))
    moqValues.push(`Số lượng/đơn vị của grade: ${[gradeQty, gradeUnit].filter(Boolean).join(" ")}`);
  moqValues.push(...matching(/số\s*lượng\s*đặt\s*hàng\s*tối\s*thiểu|minimum\s*order|\bmoq\b/i).map((s) => `Quy cách: ${s}`));
  if (moqValues.length) result.push({ label: "MOQ", lines: moqValues,
    instruction: "Xác nhận MOQ và đơn vị trước khi dùng trong bảng giá mới; không tự chuyển giá demo." });

  const portValues: string[] = [];
  const port = line(product.export_port); if (port) portValues.push(`Trường cảng xuất: ${port}`);
  const place = line(product.incoterm_place); if (place) portValues.push(`Địa điểm Incoterm: ${place}`);
  portValues.push(...matching(/cảng\s*(?:xuất|bốc\s*hàng)|shipping\s*port|loading\s*port/i).map((s) => `Quy cách: ${s}`));
  if (portValues.length > 1) result.push({ label: "Cảng / địa điểm", lines: portValues,
    instruction: "Kiểm tra cảng và địa điểm Incoterm; hai trường có thể mang ý nghĩa khác nhau." });

  const capacity = line(product.monthly_capacity);
  if (capacity) result.push({ label: "Năng lực cung cấp", lines: [`Năng lực gốc: ${capacity}`],
    instruction: "Chưa tự đổi đơn vị hoặc điền vào kg/tháng. Doanh nghiệp cần xác nhận." });
  return result;
}
