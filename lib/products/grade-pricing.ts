import { gradeKey, resolveGrade } from "@/lib/public/grade-resolution";
import { displayUnitsForCategory, formatUnitPrice, formatUnitRange, parsePriceUnit, toPricePerKg, fromPricePerKg, type PriceUnit } from "@/lib/public/price-units";
import type { Category, ProductAttributeField, SupplierProduct } from "@/lib/types";

export const MIN_GRADE_ROWS = 1;
export const MAX_GRADE_ROWS = 10;
export const CUSTOM_GRADE_OPTION = "__custom__";

export const GRADE_INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"] as const;
export type GradeIncoterm = (typeof GRADE_INCOTERMS)[number];

export type ProductGradeRow = {
  grade: string;
  is_custom: boolean;
  price_min: number | null;
  price_max: number | null;
  incoterm: string;
  moq: string;
};

export type ProductGradeRowDraft = {
  id: string;
  selectedGrade: string;
  customGrade: string;
  priceMin: string;
  priceMax: string;
  incoterm: string;
  moq: string;
};

export type ProductGradeRowValidation = {
  gradeError: string | null;
  priceError: string | null;
  incotermError: string | null;
  valid: boolean;
  normalized: ProductGradeRow | null;
};

export type PublicProductGradeRow = {
  grade: string;
  isCustom: boolean;
  priceMin: number | null;
  priceMax: number | null;
  priceText: string | null;
  incoterm: string | null;
  moq: string;
};

export type CategoryPriceUnitMeta = {
  primary: PriceUnit;
  tradeUnit: "kg" | "MT";
  unitLabel: "USD/kg" | "USD/MT";
  headerLabel: "GIÁ (USD/KG)" | "GIÁ (USD/MT)";
};

export type CategoryGradeSource = {
  slug?: string | null;
  price_unit?: string | null;
  product_fields?: ProductAttributeField[] | null;
} | null | undefined;

const BUILTIN_CATEGORY_GRADES: Array<{ match: RegExp; grades: readonly string[] }> = [
  {
    match: /(?:^|-)cashew(?:-|$)/i,
    grades: ["W180", "W210", "W240", "W320", "W450", "SW", "WS", "LP", "SP"],
  },
  {
    match: /(?:^|-)pepper(?:-|$)|^spices$/i,
    grades: ["500 g/L", "550 g/L", "570 g/L", "580 g/L", "White pepper"],
  },
  {
    match: /cinnamon|anise|cassia/i,
    grades: ["Cassia whole", "Cassia split", "Cassia powder", "Star anise", "Star anise oil"],
  },
  {
    match: /(?:^|-)rice(?:-|$)/i,
    grades: ["ST25", "Jasmine 5% broken", "White rice 5% broken", "White rice 15% broken", "White rice 25% broken", "Glutinous rice"],
  },
  {
    match: /coffee/i,
    grades: ["Robusta G1 S18", "Robusta G2 S16", "Robusta G2 5% BB", "Arabica S18", "Arabica S16"],
  },
];

const MAX_PRICE = 999_999_999_999.99;
const DECIMAL_PRICE = /^\d+(?:\.\d{1,2})?$/;

export function isGradeFieldKey(key: string | null | undefined): boolean {
  const normalized = (key ?? "").trim().toLowerCase();
  return normalized === "grade" || normalized === "product_type";
}

export function primaryGradeFieldKey(category: CategoryGradeSource): "grade" | "product_type" {
  const fields = Array.isArray(category?.product_fields) ? category!.product_fields! : [];
  if (fields.some((f) => f?.key === "product_type")) return "product_type";
  return "grade";
}

export function nonGradeProductFields<T extends Pick<ProductAttributeField, "key">>(fields: readonly T[] | null | undefined): T[] {
  if (!Array.isArray(fields)) return [];
  return fields.filter((field) => !isGradeFieldKey(field.key));
}

/**
 * Danh sách grade chuẩn theo danh mục.
 * Kết hợp danh sách chuẩn theo ngành hàng với các tùy chọn CMS khai trong product_fields
 * để đổi danh mục là danh sách grade tự cập nhật theo.
 */
export function standardGradesForCategory(category: CategoryGradeSource): string[] {
  const slug = (category?.slug ?? "").trim().toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const trimmed = raw.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    const key = gradeKey(trimmed);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  };

  for (const entry of BUILTIN_CATEGORY_GRADES) {
    if (slug && entry.match.test(slug)) {
      for (const option of entry.grades) push(option);
      break;
    }
  }

  const fields = Array.isArray(category?.product_fields) ? category!.product_fields! : [];
  for (const field of fields) {
    if (!field || !isGradeFieldKey(field.key) || !Array.isArray(field.options)) continue;
    for (const option of field.options) push(option);
  }

  return result;
}

export function matchStandardGrade(value: string | null | undefined, standardGrades: readonly string[]): string | null {
  if (!value) return null;
  const key = gradeKey(value);
  if (!key) return null;
  return standardGrades.find((option) => gradeKey(option) === key) ?? null;
}

export function categoryMarketPriceUnit(
  categorySlug: string | null | undefined,
  configuredUnit?: string | null,
): CategoryPriceUnitMeta {
  const slug = (categorySlug ?? "").trim();
  const units = displayUnitsForCategory(slug, configuredUnit ?? null);
  const isMt = units.primary === "mt";
  return {
    primary: isMt ? "mt" : "kg",
    tradeUnit: isMt ? "MT" : "kg",
    unitLabel: isMt ? "USD/MT" : "USD/kg",
    headerLabel: isMt ? "GIÁ (USD/MT)" : "GIÁ (USD/KG)",
  };
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeIncoterm(value: unknown): GradeIncoterm {
  const upper = cleanText(value, 16).toUpperCase();
  return (GRADE_INCOTERMS as readonly string[]).includes(upper) ? (upper as GradeIncoterm) : "FOB";
}

function stringAttributesOnly(specs: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!specs) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(specs)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function formatDraftNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  if (typeof value === "string" && DECIMAL_PRICE.test(value.trim()) && Number(value.trim()) > 0) return value.trim();
  return "";
}

export function createEmptyGradeRowDraft(id = "row-1"): ProductGradeRowDraft {
  return {
    id,
    selectedGrade: "",
    customGrade: "",
    priceMin: "",
    priceMax: "",
    incoterm: "FOB",
    moq: "",
  };
}

/**
 * Đọc bảng grade_rows đã lưu trong specs (nếu có), giữ nguyên cả dòng tự nhập.
 */
export function readStoredGradeRows(specs: Record<string, unknown> | null | undefined): ProductGradeRow[] {
  if (!specs || typeof specs !== "object" || !Array.isArray(specs.grade_rows)) return [];
  const rows: ProductGradeRow[] = [];
  for (const item of specs.grade_rows.slice(0, MAX_GRADE_ROWS)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const grade = cleanText(rec.grade, 80);
    if (!grade) continue;
    const min = typeof rec.price_min === "number" && Number.isFinite(rec.price_min) && rec.price_min > 0 ? rec.price_min : null;
    const max = typeof rec.price_max === "number" && Number.isFinite(rec.price_max) && rec.price_max > 0 ? rec.price_max : null;
    const validPair = min !== null && max !== null && max >= min;
    rows.push({
      grade,
      is_custom: Boolean(rec.is_custom),
      price_min: validPair ? min : null,
      price_max: validPair ? max : null,
      incoterm: normalizeIncoterm(rec.incoterm),
      moq: cleanText(rec.moq, 180),
    });
  }
  return rows;
}

/**
 * Khởi tạo danh sách dòng cho form Supplier Portal và CRM.
 * Sản phẩm cũ chưa có specs.grade_rows được chuyển mượt thành bảng 1 dòng.
 */
export function hydrateGradeRowsDraft(
  product: Pick<SupplierProduct, "name" | "spec" | "category" | "supplier_category_proposal" | "reviewed_category_slug" | "specs" | "ref_price" | "ref_price_max" | "currency" | "unit" | "incoterm" | "moq"> | null | undefined,
  category: CategoryGradeSource,
): ProductGradeRowDraft[] {
  if (!product) return [createEmptyGradeRowDraft("row-1")];

  const standardGrades = standardGradesForCategory(category);
  const stored = readStoredGradeRows(product.specs);
  if (stored.length > 0) {
    return stored.slice(0, MAX_GRADE_ROWS).map((row, index) => {
      const matched = !row.is_custom ? matchStandardGrade(row.grade, standardGrades) : null;
      const isCustom = row.is_custom || (!matched && standardGrades.length > 0);
      return {
        id: `row-${index + 1}`,
        selectedGrade: isCustom ? CUSTOM_GRADE_OPTION : (matched ?? row.grade),
        customGrade: isCustom ? row.grade : "",
        priceMin: formatDraftNumber(row.price_min),
        priceMax: formatDraftNumber(row.price_max),
        incoterm: normalizeIncoterm(row.incoterm),
        moq: row.moq,
      };
    });
  }

  // Legacy single-grade fallback: convert existing scalar price into the category market unit when possible.
  const slug = category?.slug ?? product.reviewed_category_slug ?? product.supplier_category_proposal ?? product.category ?? "";
  const unitMeta = categoryMarketPriceUnit(slug, category?.price_unit);
  const resolved = resolveGrade({
    name: product.name,
    spec: product.spec,
    categorySlug: slug,
    attributes: stringAttributesOnly(product.specs),
  });
  const rawAttrGrade = cleanText(product.specs?.grade ?? product.specs?.product_type, 80);
  const legacyGrade = rawAttrGrade || resolved.value || "";
  const matched = legacyGrade ? matchStandardGrade(legacyGrade, standardGrades) : null;

  let minVal: number | null = typeof product.ref_price === "number" && product.ref_price > 0 ? product.ref_price : null;
  let maxVal: number | null = typeof product.ref_price_max === "number" && product.ref_price_max >= (minVal ?? 0) && minVal !== null
    ? product.ref_price_max
    : minVal;

  if (minVal !== null && maxVal !== null) {
    const parsedSourceUnit = parsePriceUnit(product.unit, product.currency);
    if (parsedSourceUnit && parsedSourceUnit !== unitMeta.primary && (product.currency ?? "USD").toUpperCase().startsWith("USD")) {
      const lowKg = toPricePerKg(minVal, parsedSourceUnit);
      const highKg = toPricePerKg(maxVal, parsedSourceUnit);
      if (lowKg !== null && highKg !== null) {
        const factor = unitMeta.primary === "mt" ? 1 : 100;
        minVal = Math.round(fromPricePerKg(lowKg, unitMeta.primary) * factor) / factor;
        maxVal = Math.round(fromPricePerKg(highKg, unitMeta.primary) * factor) / factor;
      }
    }
  }

  const hasCustomLegacy = Boolean(legacyGrade && !matched);
  return [{
    id: "row-1",
    selectedGrade: matched ? matched : hasCustomLegacy ? CUSTOM_GRADE_OPTION : "",
    customGrade: hasCustomLegacy ? legacyGrade : "",
    priceMin: formatDraftNumber(minVal),
    priceMax: formatDraftNumber(maxVal),
    incoterm: normalizeIncoterm(product.incoterm),
    moq: cleanText(product.moq, 180),
  }];
}

/**
 * Khi đổi danh mục: giữ các dòng tự nhập, khớp lại grade chuẩn nếu trùng tên,
 * hoặc đặt lại về "Chọn grade" nếu grade cũ không thuộc danh mục mới.
 */
export function reconcileGradeRowsForCategory(
  rows: readonly ProductGradeRowDraft[],
  category: CategoryGradeSource,
): ProductGradeRowDraft[] {
  const standardGrades = standardGradesForCategory(category);
  return rows.map((row) => {
    if (!row.selectedGrade || row.selectedGrade === CUSTOM_GRADE_OPTION) return row;
    const matched = matchStandardGrade(row.selectedGrade, standardGrades);
    if (matched) return matched === row.selectedGrade ? row : { ...row, selectedGrade: matched };
    return { ...row, selectedGrade: "" };
  });
}

export function validateGradeRowDraft(
  row: ProductGradeRowDraft,
  category: CategoryGradeSource,
): ProductGradeRowValidation {
  const standardGrades = standardGradesForCategory(category);
  const isCustom = row.selectedGrade === CUSTOM_GRADE_OPTION;
  let grade = "";
  let gradeError: string | null = null;

  if (!row.selectedGrade) {
    gradeError = "Chọn grade cho dòng này.";
  } else if (isCustom) {
    grade = cleanText(row.customGrade, 80);
    if (!grade) gradeError = "Nhập tên grade cho dòng này.";
  } else {
    const matched = standardGrades.length > 0 ? matchStandardGrade(row.selectedGrade, standardGrades) : cleanText(row.selectedGrade, 80);
    if (!matched) {
      gradeError = "Chọn grade cho dòng này.";
    } else {
      grade = matched;
    }
  }

  const minRaw = row.priceMin.trim();
  const maxRaw = row.priceMax.trim();
  let priceMin: number | null = null;
  let priceMax: number | null = null;
  let priceError: string | null = null;

  if (minRaw !== "" || maxRaw !== "") {
    if (minRaw === "" || maxRaw === "" || !DECIMAL_PRICE.test(minRaw) || !DECIMAL_PRICE.test(maxRaw)) {
      priceError = "Nhập đủ giá từ và đến, hoặc để trống cả hai.";
    } else {
      const parsedMin = Number(minRaw);
      const parsedMax = Number(maxRaw);
      if (!Number.isFinite(parsedMin) || !Number.isFinite(parsedMax) || parsedMin <= 0 || parsedMax <= 0 ||
          parsedMin > MAX_PRICE || parsedMax > MAX_PRICE || parsedMax < parsedMin) {
        priceError = "Giá đến phải lớn hơn hoặc bằng giá từ và lớn hơn 0.";
      } else {
        priceMin = parsedMin;
        priceMax = parsedMax;
      }
    }
  }

  const incotermRaw = cleanText(row.incoterm, 16).toUpperCase() || "FOB";
  const incotermValid = (GRADE_INCOTERMS as readonly string[]).includes(incotermRaw);
  const incotermError = incotermValid ? null : "Chọn Incoterm hợp lệ.";
  const valid = !gradeError && !priceError && !incotermError;

  return {
    gradeError,
    priceError,
    incotermError,
    valid,
    normalized: valid
      ? {
          grade,
          is_custom: isCustom,
          price_min: priceMin,
          price_max: priceMax,
          incoterm: incotermRaw,
          moq: cleanText(row.moq, 180),
        }
      : null,
  };
}

export function validateGradeRowsDraft(
  rows: readonly ProductGradeRowDraft[],
  category: CategoryGradeSource,
): {
  valid: boolean;
  message: string | null;
  rowResults: ProductGradeRowValidation[];
  rows: ProductGradeRow[];
} {
  if (!Array.isArray(rows) || rows.length < MIN_GRADE_ROWS) {
    return { valid: false, message: "Cần ít nhất 1 dòng grade trong bảng Grade & giá.", rowResults: [], rows: [] };
  }
  if (rows.length > MAX_GRADE_ROWS) {
    return { valid: false, message: `Bảng Grade & giá tối đa ${MAX_GRADE_ROWS} dòng.`, rowResults: [], rows: [] };
  }
  const rowResults = rows.map((row) => validateGradeRowDraft(row, category));
  const firstBadIndex = rowResults.findIndex((item) => !item.valid);
  if (firstBadIndex !== -1) {
    const bad = rowResults[firstBadIndex];
    const reason = bad.gradeError || bad.priceError || bad.incotermError || "Kiểm tra lại thông tin dòng grade.";
    return {
      valid: false,
      message: `Dòng grade ${firstBadIndex + 1}: ${reason}`,
      rowResults,
      rows: [],
    };
  }
  return {
    valid: true,
    message: null,
    rowResults,
    rows: rowResults.map((item) => item.normalized!),
  };
}

export function serializeGradeRowsDraft(rows: readonly ProductGradeRowDraft[]): string {
  return JSON.stringify(
    rows.slice(0, MAX_GRADE_ROWS).map((row) => ({
      selectedGrade: row.selectedGrade,
      customGrade: row.customGrade,
      priceMin: row.priceMin,
      priceMax: row.priceMax,
      incoterm: row.incoterm,
      moq: row.moq,
    })),
  );
}

export function parseGradeRowsFromPayload(
  raw: unknown,
  category: CategoryGradeSource,
): { ok: true; rows: ProductGradeRow[] } | { ok: false; message: string } {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, message: "Dữ liệu bảng Grade & giá không hợp lệ." };
    }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, message: "Dữ liệu bảng Grade & giá không hợp lệ." };
  }
  if (parsed.length < MIN_GRADE_ROWS) {
    return { ok: false, message: "Cần ít nhất 1 dòng grade trong bảng Grade & giá." };
  }
  if (parsed.length > MAX_GRADE_ROWS) {
    return { ok: false, message: `Bảng Grade & giá tối đa ${MAX_GRADE_ROWS} dòng.` };
  }

  const drafts: ProductGradeRowDraft[] = parsed.map((entry, idx) => {
    const rec = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
    // Accept either ProductGradeRowDraft shape or ProductGradeRow shape
    if ("selectedGrade" in rec || "priceMin" in rec || "priceMax" in rec) {
      return {
        id: `row-${idx + 1}`,
        selectedGrade: typeof rec.selectedGrade === "string" ? rec.selectedGrade : "",
        customGrade: typeof rec.customGrade === "string" ? rec.customGrade : "",
        priceMin: rec.priceMin == null ? "" : String(rec.priceMin),
        priceMax: rec.priceMax == null ? "" : String(rec.priceMax),
        incoterm: typeof rec.incoterm === "string" ? rec.incoterm : "FOB",
        moq: typeof rec.moq === "string" ? rec.moq : "",
      };
    }
    const isCustom = Boolean(rec.is_custom);
    const gradeText = typeof rec.grade === "string" ? rec.grade : "";
    return {
      id: `row-${idx + 1}`,
      selectedGrade: isCustom ? CUSTOM_GRADE_OPTION : gradeText,
      customGrade: isCustom ? gradeText : "",
      priceMin: rec.price_min == null ? "" : String(rec.price_min),
      priceMax: rec.price_max == null ? "" : String(rec.price_max),
      incoterm: typeof rec.incoterm === "string" ? rec.incoterm : "FOB",
      moq: typeof rec.moq === "string" ? rec.moq : "",
    };
  });

  const check = validateGradeRowsDraft(drafts, category);
  if (!check.valid) {
    return { ok: false, message: check.message ?? "Kiểm tra lại bảng Grade & giá." };
  }
  return { ok: true, rows: check.rows };
}

/**
 * Tổng hợp các cột phẳng trên supplier_products từ bảng grade_rows để toàn bộ
 * truy vấn cũ, thẻ sản phẩm và SQL view tiếp tục hoạt động đồng bộ.
 */
export function summarizeGradeRowsForProduct(
  rows: readonly ProductGradeRow[],
  category: CategoryGradeSource,
): {
  ref_price: number | null;
  ref_price_max: number | null;
  currency: string | null;
  unit: string | null;
  incoterm: string | null;
  moq: string | null;
  primaryStandardGrade: string | null;
  standardGrades: string[];
  gradeFieldKey: "grade" | "product_type";
} {
  const unitMeta = categoryMarketPriceUnit(category?.slug, category?.price_unit);
  const priced = rows.filter((row) => row.price_min !== null && row.price_max !== null);
  const refPrice = priced.length > 0 ? Math.min(...priced.map((row) => row.price_min!)) : null;
  const refPriceMax = priced.length > 0 ? Math.max(...priced.map((row) => row.price_max!)) : null;
  const firstIncoterm = rows.find((row) => row.incoterm)?.incoterm ?? null;
  const firstMoq = rows.find((row) => row.moq)?.moq ?? null;

  const standardGrades: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.is_custom || !row.grade) continue;
    const key = gradeKey(row.grade);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    standardGrades.push(row.grade);
  }

  return {
    ref_price: refPrice,
    ref_price_max: refPriceMax,
    currency: refPrice !== null ? "USD" : null,
    unit: refPrice !== null ? unitMeta.tradeUnit : null,
    incoterm: firstIncoterm,
    moq: firstMoq,
    primaryStandardGrade: standardGrades[0] ?? null,
    standardGrades,
    gradeFieldKey: primaryGradeFieldKey(category),
  };
}

export function applyGradeRowsToSpecs(
  baseSpecs: Record<string, unknown>,
  rows: readonly ProductGradeRow[],
  category: CategoryGradeSource,
): Record<string, unknown> {
  const summary = summarizeGradeRowsForProduct(rows, category);
  const next: Record<string, unknown> = { ...baseSpecs };
  delete next.grade;
  delete next.product_type;
  if (summary.primaryStandardGrade) {
    next[summary.gradeFieldKey] = summary.primaryStandardGrade;
  }
  next.grade_rows = rows.map((row) => ({
    grade: row.grade,
    is_custom: row.is_custom,
    price_min: row.price_min,
    price_max: row.price_max,
    incoterm: row.incoterm,
    moq: row.moq,
  }));
  return next;
}

export function formatGradeRowPriceBuyer(
  priceMin: number | null,
  priceMax: number | null,
  unit: PriceUnit,
): string | null {
  if (priceMin === null || priceMax === null || priceMin <= 0 || priceMax < priceMin) return null;
  if (priceMin === priceMax) return formatUnitPrice(priceMin, unit);
  return formatUnitRange(priceMin, priceMax, unit);
}

export function formatGradeRowPriceVi(
  priceMin: number | null,
  priceMax: number | null,
  unitLabel: "USD/kg" | "USD/MT",
): string {
  if (priceMin === null || priceMax === null || priceMin <= 0 || priceMax < priceMin) {
    return "Báo giá theo yêu cầu";
  }
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: unitLabel === "USD/kg" && !Number.isInteger(n) ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(n);
  if (priceMin === priceMax) return `${fmt(priceMin)} ${unitLabel}`;
  return `${fmt(priceMin)} - ${fmt(priceMax)} ${unitLabel}`;
}

/**
 * Chiếu dữ liệu grade_rows sang trang buyer công khai.
 * Tuyệt đối ẩn toàn bộ giá từng dòng khi cổng công khai giá (canShowPrice) đang khoá.
 */
export function projectPublicGradeData(
  product: Pick<SupplierProduct, "name" | "spec" | "specs" | "ref_price" | "ref_price_max" | "currency" | "unit" | "incoterm" | "moq" | "updated_at">,
  category: Category | Pick<Category, "slug" | "price_unit" | "product_fields">,
  options: {
    canShowPrice: boolean;
    sanitizeText: (value: string) => string;
    translateMoq: (moq: string | null | undefined) => string;
    fallbackMoq?: string | null;
    fallbackUpdatedAt?: string | null;
  },
): {
  hasGradeRows: boolean;
  primaryGrade: string | null;
  standardGrades: string[];
  summaryPrice: string | null;
  gradeRows: PublicProductGradeRow[];
  gradePricePoints: Array<{
    value: number;
    highValue: number;
    unit: string;
    currency: string;
    updatedAt: string | null;
    grade: string;
  }>;
} {
  const unitMeta = categoryMarketPriceUnit(category.slug, category.price_unit);
  const standardOptions = standardGradesForCategory(category);
  const stored = readStoredGradeRows(product.specs);
  const updatedAt = product.updated_at ?? options.fallbackUpdatedAt ?? null;

  if (stored.length > 0) {
    const standardGrades: string[] = [];
    const seenGrades = new Set<string>();
    const gradePricePoints: Array<{
      value: number;
      highValue: number;
      unit: string;
      currency: string;
      updatedAt: string | null;
      grade: string;
    }> = [];

    const gradeRows: PublicProductGradeRow[] = stored.map((row) => {
      const matchedStandard = !row.is_custom
        ? (standardOptions.length > 0 ? matchStandardGrade(row.grade, standardOptions) : row.grade)
        : null;
      const isCustom = row.is_custom || !matchedStandard;
      const displayGrade = options.sanitizeText(matchedStandard ?? row.grade).trim();

      if (!isCustom && displayGrade) {
        const key = gradeKey(displayGrade);
        if (key && !seenGrades.has(key)) {
          seenGrades.add(key);
          standardGrades.push(displayGrade);
        }
      }

      const allowRowPrice = options.canShowPrice && row.price_min !== null && row.price_max !== null && row.price_max >= row.price_min && row.price_min > 0;
      const priceText = allowRowPrice ? formatGradeRowPriceBuyer(row.price_min, row.price_max, unitMeta.primary) : null;

      if (allowRowPrice && !isCustom && displayGrade) {
        gradePricePoints.push({
          value: row.price_min!,
          highValue: row.price_max!,
          unit: unitMeta.tradeUnit,
          currency: "USD",
          updatedAt,
          grade: displayGrade,
        });
      }

      const rawMoq = row.moq || options.fallbackMoq || "";
      const cleanMoq = options.sanitizeText(options.translateMoq(rawMoq)).trim() || "On request";
      const cleanIncoterm = options.sanitizeText(row.incoterm || "").trim() || null;

      return {
        grade: displayGrade || "Standard",
        isCustom,
        priceMin: allowRowPrice ? row.price_min : null,
        priceMax: allowRowPrice ? row.price_max : null,
        priceText,
        incoterm: cleanIncoterm,
        moq: cleanMoq,
      };
    });

    const pricedRows = gradeRows.filter((row) => row.priceMin !== null && row.priceMax !== null);
    const summaryPrice = pricedRows.length > 0
      ? formatGradeRowPriceBuyer(
          Math.min(...pricedRows.map((row) => row.priceMin!)),
          Math.max(...pricedRows.map((row) => row.priceMax!)),
          unitMeta.primary,
        )
      : null;

    return {
      hasGradeRows: true,
      primaryGrade: standardGrades[0] ?? null,
      standardGrades,
      summaryPrice,
      gradeRows,
      gradePricePoints,
    };
  }

  // Legacy single-grade fallback projection
  const resolved = resolveGrade({
    name: product.name,
    spec: product.spec,
    categorySlug: category.slug,
    attributes: stringAttributesOnly(product.specs),
  });
  const legacyGrade = resolved.value ? options.sanitizeText(resolved.value).trim() : null;
  const standardGrades = legacyGrade ? [legacyGrade] : [];

  return {
    hasGradeRows: false,
    primaryGrade: legacyGrade,
    standardGrades,
    summaryPrice: null,
    gradeRows: [],
    gradePricePoints: [],
  };
}
