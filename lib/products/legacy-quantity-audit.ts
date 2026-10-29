import { parseLegacyMoqString } from "@/lib/products/grade-pricing";
import { parsePriceUnit, toPricePerKg } from "@/lib/public/price-units";

type LegacyRow = Record<string, unknown>;
type AuditItem = {
  productId: string;
  rowIndex: number | null;
  grade: string | null;
  moqOriginal: string | null;
  reasons: string[];
  candidate: null | { grade: string; customGrade: boolean; quantityKg: number; priceUsdPerKg: number; incoterm: string };
};

const object = (value: unknown): LegacyRow => value && typeof value === "object" && !Array.isArray(value) ? value as LegacyRow : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const positive = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const TERMS = new Set(["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"]);
const exactWeight = (qty: number, unit: string, weight: number | null): number | null => {
  if (unit === "kg") return qty;
  if (unit === "mt") return qty * 1000;
  if ((unit === "bag" || unit === "carton") && Number.isInteger(qty) && weight !== null) return qty * weight;
  return null;
};

/**
 * Offline, read-only inventory. Candidates are suggestions, not an executable
 * migration. Never infer unknown units, turn a container into weight, or fill
 * missing per-grade MOQ from a different grade. Legacy source remains untouched.
 */
export function auditLegacyQuantityProducts(products: unknown[]): AuditItem[] {
  const result: AuditItem[] = [];
  for (const source of products) {
    const product = object(source);
    const productId = text(product.id) || "(missing id)";
    const specs = object(product.specs);
    const malformedRows = specs.grade_rows != null && !Array.isArray(specs.grade_rows);
    const rawRows = Array.isArray(specs.grade_rows) ? specs.grade_rows : [];
    const rows: unknown[] = rawRows.length ? rawRows : [null];
    const gradeCounts = new Map<string, number>();
    for (const row of rawRows) {
      const key = text(object(row).grade).normalize("NFKC").toLowerCase();
      if (key) gradeCounts.set(key, (gradeCounts.get(key) ?? 0) + 1);
    }
    for (let index = 0; index < rows.length; index++) {
      const row = object(rows[index]);
      const multiGrade = rawRows.length > 0;
      const grade = text(multiGrade ? row.grade : specs.grade);
      const reasons: string[] = [];
      if (productId === "(missing id)") reasons.push("Thiếu mã sản phẩm.");
      if (malformedRows) reasons.push("Dữ liệu danh sách grade không hợp lệ.");
      if (!grade) reasons.push("Thiếu grade có cấu trúc.");
      const gradeKey = grade.normalize("NFKC").toLowerCase();
      if (gradeKey && (gradeCounts.get(gradeKey) ?? 0) > 1) reasons.push("Grade bị lặp trong sản phẩm cũ.");
      const moqSource = multiGrade ? row : product;
      const moqOriginal = text(moqSource.moq) || null;
      const qty = positive(moqSource.moq_qty);
      const unit = text(moqSource.moq_unit).toLowerCase();
      const weight = positive(multiGrade ? row.moq_unit_weight_kg : specs.moq_unit_weight_kg);
      let quantityKg: number | null = null;
      if (qty && ["kg", "mt", "bag", "carton"].includes(unit)) {
        quantityKg = exactWeight(qty, unit, weight);
      } else if (moqOriginal && !/\d[.,]\d{3}(?:\D|$)/.test(moqOriginal)) {
        const parsed = parseLegacyMoqString(moqOriginal);
        if (parsed.status === "converted") quantityKg = exactWeight(parsed.qty, parsed.unit, parsed.unitWeightKg);
      }
      if (quantityKg === null || !Number.isFinite(quantityKg) || quantityKg <= 0 || Math.abs(quantityKg - Math.round(quantityKg)) > 1e-7 || quantityKg > 1_000_000_000) {
        reasons.push("MOQ thiếu, mơ hồ, là container, thiếu kg mỗi bao/thùng hoặc chưa quy đổi an toàn sang kg nguyên.");
        quantityKg = null;
      } else quantityKg = Math.round(quantityKg);
      const minimum = positive(multiGrade ? row.price_min : product.ref_price);
      const currency = text(product.currency).toUpperCase();
      const unitText = text(product.unit);
      const priceUnit = /^(?:usd\s*\/\s*)?(?:kg|kilograms?|mt|t|tons?|tonnes?)$/i.test(unitText) ? parsePriceUnit(unitText) : null;
      let priceUsdPerKg: number | null = null;
      if (minimum && currency === "USD" && (priceUnit === "kg" || priceUnit === "mt")) priceUsdPerKg = toPricePerKg(minimum, priceUnit);
      if (priceUsdPerKg === null || !Number.isFinite(priceUsdPerKg) || priceUsdPerKg <= 0) reasons.push("Thiếu giá từ, tiền tệ USD hoặc đơn vị giá kg/MT rõ ràng.");
      // Current revision schema only supports USD/kg to cents. Do not round a
      // converted value and accidentally change the actual quoted price.
      else if (Math.abs(priceUsdPerKg * 100 - Math.round(priceUsdPerKg * 100)) > 1e-7) {
        reasons.push("Giá quy đổi cần độ chính xác cao hơn mô hình hiện tại.");
        priceUsdPerKg = null;
      }
      const incoterm = text(multiGrade ? row.incoterm : product.incoterm).toUpperCase();
      if (!TERMS.has(incoterm)) reasons.push("Thiếu Incoterm hợp lệ.");
      result.push({ productId, rowIndex: multiGrade ? index : null, grade: grade || null, moqOriginal,
        reasons, candidate: reasons.length || !grade || quantityKg === null || priceUsdPerKg === null ? null : {
          grade, customGrade: row.is_custom === true, quantityKg, priceUsdPerKg, incoterm,
        } });
    }
  }
  return result;
}
