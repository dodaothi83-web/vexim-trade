import { parseLegacyMoqString } from "@/lib/products/grade-pricing";
import { parsePriceUnit, toPricePerKg } from "@/lib/public/price-units";

type LegacyRow = Record<string, unknown>;
type AuditItem = {
  productId: string;
  rowIndex: number | null;
  grade: string | null;
  moqOriginal: string | null;
  moqQuantity: number | null;
  moqUnit: string | null;
  moqUnitWeightKg: number | null;
  reasons: string[];
  candidate: null | { grade: string; customGrade: boolean; quantityKg: number; priceUsdPerKg: number; incoterm: string };
};

const object = (value: unknown): LegacyRow => value && typeof value === "object" && !Array.isArray(value) ? value as LegacyRow : {};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
// PostgREST can return PostgreSQL numeric values as decimal strings. Reject
// exponent notation, punctuation and non-finite values instead of guessing.
const positive = (value: unknown): number | null => {
  const number = typeof value === "number" ? value :
    typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
};
// Compare decimal source strings without binary-float rounding, so a tiny
// difference in a persisted price range is never silently treated as one price.
function decimalKey(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) return null;
  return `${match[1].replace(/^0+(?=\d)/, "")}.${(match[2] ?? "").replace(/0+$/, "")}`;
}
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
      // One historical listing can represent several grades, while the new
      // contract is one grade per product. Never propose a silent split or
      // change its existing indexed identity and relationships.
      if (rawRows.length > 1) reasons.push("Nhiều grade dùng chung một sản phẩm và URL; cần quyết định ánh xạ trước khi chuyển.");
      if (!grade) reasons.push("Thiếu grade có cấu trúc.");
      const gradeKey = grade.normalize("NFKC").toLowerCase();
      if (gradeKey && (gradeCounts.get(gradeKey) ?? 0) > 1) reasons.push("Grade bị lặp trong sản phẩm cũ.");
      const moqSource = multiGrade ? row : product;
      const moqOriginal = text(moqSource.moq) || null;
      const qty = positive(moqSource.moq_qty);
      const unit = text(moqSource.moq_unit).toLowerCase();
      const weight = positive(multiGrade ? row.moq_unit_weight_kg : specs.moq_unit_weight_kg);
      let quantityKg: number | null = null;
      // Structured fields take precedence even when incomplete or unsupported.
      // In particular, a container must not be replaced with an unrelated text weight.
      const hasStructuredMoq = moqSource.moq_qty != null || moqSource.moq_unit != null;
      if (hasStructuredMoq) {
        if (unit === "bag" || unit === "carton") reasons.push("MOQ theo bao hoặc thùng cần xác nhận thủ công trước khi quy đổi.");
        if (qty && ["kg", "mt", "bag", "carton"].includes(unit)) quantityKg = exactWeight(qty, unit, weight);
      } else if (moqOriginal && !/\d[.,]\d{3}(?:\D|$)/.test(moqOriginal)) {
        const parsed = parseLegacyMoqString(moqOriginal);
        if (parsed.status === "converted") {
          if (parsed.unit === "bag" || parsed.unit === "carton") reasons.push("MOQ theo bao hoặc thùng cần xác nhận thủ công trước khi quy đổi.");
          quantityKg = exactWeight(parsed.qty, parsed.unit, parsed.unitWeightKg);
        }
      }
      if (quantityKg === null || !Number.isFinite(quantityKg) || quantityKg <= 0 || Math.abs(quantityKg - Math.round(quantityKg)) > 1e-7 || quantityKg > 1_000_000_000) {
        reasons.push("MOQ thiếu, mơ hồ, là container, thiếu kg mỗi bao/thùng hoặc chưa quy đổi an toàn sang kg nguyên.");
        quantityKg = null;
      } else quantityKg = Math.round(quantityKg);
      const minRaw = multiGrade ? row.price_min : product.ref_price;
      const minimum = positive(minRaw);
      const maxRaw = multiGrade ? row.price_max : product.ref_price_max;
      const maximum = positive(maxRaw);
      if (maxRaw != null && String(maxRaw).trim() !== "") {
        if (maximum === null || minimum === null || maximum < minimum || !decimalKey(minRaw) || !decimalKey(maxRaw))
          reasons.push("Khoảng giá cũ không hợp lệ; cần kiểm tra thủ công.");
        else if (decimalKey(maxRaw) !== decimalKey(minRaw))
          reasons.push("Khoảng giá cũ có giá từ và giá đến; không tự chọn một giá thay thế.");
      }
      // Even if a grade row has a single price, replacing the listing could
      // change its separate product-level range shown by legacy surfaces.
      if (multiGrade && product.ref_price_max != null && String(product.ref_price_max).trim() !== "") {
        const productMin = positive(product.ref_price), productMax = positive(product.ref_price_max);
        if (productMin === null || productMax === null || productMax < productMin || !decimalKey(product.ref_price) || !decimalKey(product.ref_price_max))
          reasons.push("Khoảng giá chung của sản phẩm không hợp lệ; cần kiểm tra thủ công.");
        else if (decimalKey(product.ref_price_max) !== decimalKey(product.ref_price))
          reasons.push("Sản phẩm còn khoảng giá chung khác; cần giữ nguyên và rà soát trước khi chuyển.");
      }
      const currency = text(product.currency).toUpperCase();
      const unitText = text(product.unit);
      const priceUnit = /^(?:usd\s*\/\s*)?(?:kg|kilograms?|mt|t|tons?|tonnes?)$/i.test(unitText) ? parsePriceUnit(unitText) : null;
      let priceUsdPerKg: number | null = null;
      if (minimum && currency === "USD" && (priceUnit === "kg" || priceUnit === "mt")) priceUsdPerKg = toPricePerKg(minimum, priceUnit);
      if (priceUsdPerKg === null || !Number.isFinite(priceUsdPerKg) || priceUsdPerKg <= 0 || priceUsdPerKg > 1_000_000_000) {
        reasons.push("Thiếu giá từ, tiền tệ USD hoặc đơn vị giá kg/MT rõ ràng, hoặc giá vượt giới hạn an toàn.");
        priceUsdPerKg = null;
      }
      // Current revision schema only supports USD/kg to cents. Do not round a
      // converted value and accidentally change the actual quoted price.
      else if (Math.abs(priceUsdPerKg * 100 - Math.round(priceUsdPerKg * 100)) > 1e-7) {
        reasons.push("Giá quy đổi cần độ chính xác cao hơn mô hình hiện tại.");
        priceUsdPerKg = null;
      }
      const incoterm = text(multiGrade ? row.incoterm : product.incoterm).toUpperCase();
      if (!TERMS.has(incoterm)) reasons.push("Thiếu Incoterm hợp lệ.");
      result.push({ productId, rowIndex: multiGrade ? index : null, grade: grade || null, moqOriginal,
        moqQuantity: qty, moqUnit: unit || null, moqUnitWeightKg: weight,
        reasons, candidate: reasons.length || !grade || quantityKg === null || priceUsdPerKg === null ? null : {
          grade, customGrade: row.is_custom === true, quantityKg, priceUsdPerKg, incoterm,
        } });
    }
  }
  return result;
}
