/**
 * Rules for the next supplier pricing model. This module is deliberately isolated
 * from the legacy multi-grade editor: it must not change published offers until
 * versioned persistence and both review workflows are in place.
 *
 * Quantities are whole kg; the end of a tier is the next minimum minus one kg.
 * Each tier keeps its own Incoterm and the table keeps one currency (USD, VND or
 * EUR) with at most two decimal places. The field name `priceUsdPerKg` is kept
 * for stored records; the amount is per kg in the tier's own currency.
 */
export const PRICE_CURRENCIES = ["USD", "VND", "EUR"] as const;
export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];
export const DEFAULT_PRICE_CURRENCY: PriceCurrency = "USD";

/** Tiền tệ được phép nhập mới (quyết định 30/10/2026: tạm thời chỉ USD).
 *  Dữ liệu VND/EUR đã lưu vẫn đọc và hiển thị bình thường; ràng buộc DB hiện tại
 *  cũng chỉ nhận USD. Mở lại VND/EUR bằng cách thêm mã vào mảng này sau khi áp
 *  migration tiền tệ — không phải sửa chỗ nào khác. */
export const ENTRY_PRICE_CURRENCIES: readonly PriceCurrency[] = ["USD"];

/** Lý do từ chối tiền tệ ở luồng nhập giá, hoặc null nếu được phép. */
export function entryCurrencyIssue(raw: string | null | undefined): string | null {
  const code = normalizePriceCurrency(raw) ?? null;
  if (!code) return "Chọn tiền tệ USD.";
  return ENTRY_PRICE_CURRENCIES.includes(code) ? null
    : `Tạm thời chỉ nhập giá bằng USD; bảng ${code} chưa được mở.`;
}

/** Only the three trade currencies are accepted; anything else fails closed. */
export function normalizePriceCurrency(raw: string | null | undefined): PriceCurrency | null {
  const value = (raw ?? "").trim().toUpperCase();
  return (PRICE_CURRENCIES as readonly string[]).includes(value) ? value as PriceCurrency : null;
}

export type QuantityPriceTier = { minKg: number; priceUsdPerKg: number; incoterm: string; currency: PriceCurrency };
export type GradePriceBounds = { minUsdPerKg: number; maxUsdPerKg: number };
export type QuantityPricingPolicy = {
  maxTiers: number;
  maxPriceRatio: number;
  maxLastMoqRatio: number;
  gradeBounds?: Record<string, GradePriceBounds>;
};

export const DEFAULT_QUANTITY_PRICING_POLICY: Readonly<QuantityPricingPolicy> = {
  maxTiers: 4,
  maxPriceRatio: 1.5,
  maxLastMoqRatio: 100,
};

export type QuantityPricingInput = {
  grade: string;
  /** Fallback Incoterm for rows that do not carry their own. */
  incoterm: string;
  currency?: string;
  nameVi: string;
  nameEn: string;
  tiers: Array<{ minKg: string; priceUsdPerKg: string; incoterm?: string }>;
};
export type QuantityPricingIssue = {
  code: string;
  message: string;
  tierIndex?: number;
};
export type QuantityPricingResult = {
  errors: QuantityPricingIssue[];
  warnings: QuantityPricingIssue[];
  value: { grade: string; incoterm: string; currency: PriceCurrency; tiers: QuantityPriceTier[] } | null;
};

const INCOTERMS = new Set(["FOB", "CIF", "CFR", "EXW", "FCA", "DAP", "DDP"]);
const MAX_KG = 1_000_000_000;
const MAX_CENTS = 100_000_000_000;
const WHOLE_KG = /^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/;
const USD_PRICE = /^[0-9]+(?:[.,][0-9]{1,2})?$/;

/** Do not guess ambiguous separators in supplier quantities or prices. */
export function parseQuantityKg(raw: string): number | null {
  const text = raw.trim();
  if (!WHOLE_KG.test(text)) return null;
  const n = Number(text.replace(/,/g, ""));
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_KG ? n : null;
}

export function formatQuantityInput(raw: string, previous = ""): string {
  if (!/^[0-9,]*$/.test(raw)) return raw;
  // Preserve invalid pasted separators rather than silently changing 1,5 to 15.
  // A single digit insertion or deletion in a formatted value may be regrouped.
  const singleDigitEdit = WHOLE_KG.test(previous) && (
    (raw.length === previous.length + 1 && [...raw].some((char, i) => /\d/.test(char) && raw.slice(0, i) + raw.slice(i + 1) === previous)) ||
    (previous.length === raw.length + 1 && [...previous].some((char, i) => /\d/.test(char) && previous.slice(0, i) + previous.slice(i + 1) === raw))
  );
  if (raw.includes(",") && !WHOLE_KG.test(raw) && !singleDigitEdit) return raw;
  const digits = raw.replace(/,/g, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function normalizePriceInput(raw: string): string {
  const text = raw.trim().replace(",", ".");
  if (!USD_PRICE.test(raw.trim())) return raw;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount.toFixed(2) : raw;
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

/** Match whole grade tokens rather than e.g. WS inside a longer word. */
export function nameContainsGrade(name: string, grades: readonly string[]): boolean {
  const text = normalized(name);
  return grades.some((raw) => {
    const grade = normalized(raw);
    if (!grade) return false;
    let at = text.indexOf(grade);
    while (at >= 0) {
      const before = at === 0 ? "" : text[at - 1];
      const after = text[at + grade.length] ?? "";
      if ((!before || !/[\p{L}\p{N}]/u.test(before)) && (!after || !/[\p{L}\p{N}]/u.test(after))) return true;
      at = text.indexOf(grade, at + 1);
    }
    return false;
  });
}

function centsFromText(raw: string): number | null {
  const text = raw.trim();
  if (!USD_PRICE.test(text)) return null;
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_CENTS ? cents : null;
}

/** Validates untrusted form values, including ordered tiers and grade-specific warnings. */
export function validateQuantityPricing(
  input: QuantityPricingInput,
  standardGrades: readonly string[],
  policy: QuantityPricingPolicy = DEFAULT_QUANTITY_PRICING_POLICY,
): QuantityPricingResult {
  const errors: QuantityPricingIssue[] = [];
  const warnings: QuantityPricingIssue[] = [];
  if (!Number.isSafeInteger(policy.maxTiers) || policy.maxTiers < 1 || policy.maxTiers > 100 ||
      !Number.isFinite(policy.maxPriceRatio) || policy.maxPriceRatio < 1 ||
      !Number.isFinite(policy.maxLastMoqRatio) || policy.maxLastMoqRatio < 1) {
    return { errors: [{ code: "invalid_policy", message: "Cấu hình kiểm tra giá không hợp lệ." }], warnings, value: null };
  }
  const grade = standardGrades.find((g) => normalized(g) === normalized(input.grade)) ?? "";
  if (!grade) errors.push({ code: "grade", message: "Chọn một grade chuẩn của danh mục." });
  const fallbackIncoterm = input.incoterm.trim().toUpperCase();
  const currency = normalizePriceCurrency(input.currency ?? DEFAULT_PRICE_CURRENCY);
  if (!currency) errors.push({ code: "currency", message: "Chọn tiền tệ USD, VND hoặc EUR." });
  const gradeInName = [...standardGrades, input.grade].find((g) => nameContainsGrade(input.nameVi, [g]));
  if (gradeInName) errors.push({ code: "name_vi_grade", message: `Bỏ grade (${gradeInName}) ra khỏi tên sản phẩm.` });
  if (nameContainsGrade(input.nameEn, [...standardGrades, input.grade])) errors.push({ code: "name_en_grade", message: "Không ghi grade trong tên sản phẩm tiếng Anh." });
  const maxTiers = Math.min(policy.maxTiers, 4);
  if (input.tiers.length < 1 || input.tiers.length > maxTiers) {
    errors.push({ code: "tier_count", message: `Nhập từ 1 đến ${maxTiers} mức giá.` });
    return { errors, warnings, value: null };
  }
  const tiers: QuantityPriceTier[] = [];
  const centsList: number[] = [];
  input.tiers.forEach((row, tierIndex) => {
    const kg = parseQuantityKg(row.minKg);
    const cents = centsFromText(row.priceUsdPerKg);
    const tierIncoterm = (row.incoterm ?? fallbackIncoterm).trim().toUpperCase();
    if (kg === null) {
      errors.push({ code: "quantity", tierIndex, message: "Số lượng từ phải là số kg nguyên lớn hơn 0." });
    }
    if (cents === null) errors.push({ code: "price", tierIndex, message: `Nhập đơn giá ${currency ?? "USD"}/kg lớn hơn 0, tối đa 2 chữ số thập phân.` });
    if (!INCOTERMS.has(tierIncoterm)) errors.push({ code: "incoterm", tierIndex, message: `Chọn Incoterm cho mức giá ${tierIndex + 1}.` });
    if (kg === null || cents === null || !currency || !INCOTERMS.has(tierIncoterm)) return;
    tiers.push({ minKg: kg, priceUsdPerKg: cents / 100, incoterm: tierIncoterm, currency });
    centsList.push(cents);
  });
  // Avoid comparing across a malformed or missing row.
  if (tiers.length === input.tiers.length && tiers.length) {
    for (let i = 1; i < tiers.length; i++) {
      if (tiers[i].minKg <= tiers[i - 1].minKg) errors.push({ code: "quantity_order", tierIndex: i, message: "Số lượng dòng sau phải lớn hơn dòng trước." });
      if (centsList[i] > centsList[i - 1]) errors.push({ code: "price_order", tierIndex: i, message: "Giá dòng sau phải thấp hơn hoặc bằng dòng trước." });
    }
    const max = Math.max(...centsList);
    const min = Math.min(...centsList);
    if (max / min > policy.maxPriceRatio + 1e-12) errors.push({ code: "price_spread", message: "Chênh lệch giữa giá cao nhất và thấp nhất vượt giới hạn." });
    if (tiers[tiers.length - 1].minKg / tiers[0].minKg > policy.maxLastMoqRatio + 1e-12) {
      errors.push({ code: "quantity_spread", message: "Số lượng từ của dòng cuối vượt giới hạn so với MOQ." });
    }
    // Reference bounds are stored in USD/kg; other currencies are reviewed by staff.
    const boundsEntry = currency === "USD"
      ? Object.entries(policy.gradeBounds ?? {}).find(([key]) => normalized(key) === normalized(grade))
      : undefined;
    const bounds = boundsEntry?.[1];
    if (bounds) {
      if (!Number.isFinite(bounds.minUsdPerKg) || !Number.isFinite(bounds.maxUsdPerKg) ||
          bounds.minUsdPerKg <= 0 || bounds.maxUsdPerKg < bounds.minUsdPerKg) {
        errors.push({ code: "invalid_grade_bounds", message: "Ngưỡng giá của grade chưa được cấu hình hợp lệ." });
      } else {
        tiers.forEach((tier, tierIndex) => {
          if (tier.priceUsdPerKg < bounds.minUsdPerKg || tier.priceUsdPerKg > bounds.maxUsdPerKg) {
            warnings.push({ code: "grade_price_outlier", tierIndex, message: "Giá nằm ngoài ngưỡng tham khảo của grade và cần được rà soát." });
          }
        });
      }
    }
  }
  const firstIncoterm = tiers[0]?.incoterm ?? fallbackIncoterm;
  return { errors, warnings, value: errors.length || !currency ? null : { grade, incoterm: firstIncoterm, currency, tiers } };
}

/** Bản xem trước khi người dùng còn đang nhập: bỏ qua các lỗi chặn lưu
 *  (chưa chọn grade, tên chưa dịch) và chỉ giữ những mức đã có đủ số lượng + giá.
 *  Nhờ vậy buyer preview cập nhật ngay khi gõ, không bị trắng vì thiếu grade.
 *  Dữ liệu trả về chỉ để hiển thị, không dùng để lưu. */
export function previewQuantityTiers(
  input: Pick<QuantityPricingInput, "grade" | "incoterm" | "currency" | "tiers">,
  standardGrades: readonly string[] = [],
): { grade: string; currency: PriceCurrency; tiers: QuantityPriceTier[] } {
  const currency = normalizePriceCurrency(input.currency) ?? DEFAULT_PRICE_CURRENCY;
  const fallbackIncoterm = (input.incoterm ?? "").trim().toUpperCase();
  const tiers: QuantityPriceTier[] = [];
  for (const row of input.tiers ?? []) {
    const minKg = parseQuantityKg(row.minKg);
    const cents = centsFromText(row.priceUsdPerKg);
    if (minKg === null || cents === null) continue;
    const incoterm = (row.incoterm ?? fallbackIncoterm).trim().toUpperCase();
    tiers.push({ minKg, priceUsdPerKg: cents / 100, incoterm: INCOTERMS.has(incoterm) ? incoterm : "", currency });
  }
  const grade = standardGrades.find((value) => normalized(value) === normalized(input.grade)) ?? input.grade.trim();
  return { grade, currency, tiers };
}

/** Buyer quantities switch to MT at 1,000 kg; internal quantities stay in kg. */
export function formatQuantityBuyer(kg: number): string {
  const value = kg >= 1000 ? kg / 1000 : kg;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value)} ${kg >= 1000 ? "MT" : "kg"}`;
}

export function quantityTierRanges(tiers: readonly QuantityPriceTier[]): Array<QuantityPriceTier & { maxKg: number | null }> {
  return tiers.map((tier, index) => ({ ...tier, maxKg: tiers[index + 1] ? tiers[index + 1].minKg - 1 : null }));
}

export function formatQuantityPriceBuyer(pricePerKg: number, unit: "kg" | "mt", currency: PriceCurrency = DEFAULT_PRICE_CURRENCY): string {
  const value = unit === "mt" ? pricePerKg * 1000 : pricePerKg;
  const digits = unit === "mt" ? 0 : 2;
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)}/${unit === "mt" ? "MT" : "kg"}`;
}

/** Unknown or future confirmation must not earn ranking/reference-price credit. */
export function referencePriceAge(confirmedAt: string | null | undefined, now: number, staleAfterDays = 90): { days: number | null; stale: boolean } {
  const timestamp = confirmedAt ? Date.parse(confirmedAt) : NaN;
  if (!Number.isFinite(timestamp) || !Number.isFinite(now) || timestamp > now || !Number.isFinite(staleAfterDays) || staleAfterDays < 0) {
    return { days: null, stale: true };
  }
  const age = now - timestamp;
  return { days: Math.floor(age / 86_400_000), stale: age > staleAfterDays * 86_400_000 };
}
