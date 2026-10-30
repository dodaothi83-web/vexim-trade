export type QuantityPriceSettings = {
  max_tiers: number;
  max_price_ratio: number;
  max_last_moq_ratio: number;
  reminder_days: number;
  stale_days: number;
  offer_max_discount_percent: number;
  offer_max_days: number;
  offer_cooldown_days: number;
  offer_price_lock_days: number;
};

/** Explicit bounds also prevent exceeding the corresponding database numeric columns. */
const fields: Record<keyof QuantityPriceSettings, { min: number; max: number; decimalPlaces: number }> = {
  max_tiers: { min: 1, max: 100, decimalPlaces: 0 },
  max_price_ratio: { min: 1, max: 999_999, decimalPlaces: 4 },
  max_last_moq_ratio: { min: 1, max: 99_999_999, decimalPlaces: 4 },
  reminder_days: { min: 1, max: 36_500, decimalPlaces: 0 },
  stale_days: { min: 1, max: 36_500, decimalPlaces: 0 },
  offer_max_discount_percent: { min: 0.01, max: 100, decimalPlaces: 2 },
  offer_max_days: { min: 1, max: 36_500, decimalPlaces: 0 },
  offer_cooldown_days: { min: 0, max: 36_500, decimalPlaces: 0 },
  offer_price_lock_days: { min: 0, max: 36_500, decimalPlaces: 0 },
};

function parseNumber(value: unknown, limits: { min: number; max: number; decimalPlaces: number }): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const pattern = limits.decimalPlaces ? new RegExp(`^\\d+(?:\\.\\d{1,${limits.decimalPlaces}})?$`) : /^\d+$/;
  if (!pattern.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= limits.min && parsed <= limits.max ? parsed : null;
}

export function parseQuantityPriceSettings(fd: FormData): QuantityPriceSettings | null {
  const result: Partial<QuantityPriceSettings> = {};
  for (const key of Object.keys(fields) as Array<keyof QuantityPriceSettings>) {
    const value = parseNumber(fd.get(key), fields[key]);
    if (value === null) return null;
    result[key] = value;
  }
  return result as QuantityPriceSettings;
}

export type GradeBoundsInput = { min_usd_per_kg: number; max_usd_per_kg: number } | null;
/** Both blank removes a configured bound; one blank or malformed is rejected. */
export function parseGradeBounds(fd: FormData): { ok: true; bounds: GradeBoundsInput } | { ok: false } {
  const rawMin = fd.get("min_usd_per_kg"), rawMax = fd.get("max_usd_per_kg");
  if (typeof rawMin !== "string" || typeof rawMax !== "string") return { ok: false };
  if (!rawMin.trim() && !rawMax.trim()) return { ok: true, bounds: null };
  const limits = { min: 0.0001, max: 1_000_000_000, decimalPlaces: 4 };
  const min = parseNumber(rawMin, limits), max = parseNumber(rawMax, limits);
  if (min === null || max === null || max < min) return { ok: false };
  return { ok: true, bounds: { min_usd_per_kg: min, max_usd_per_kg: max } };
}

export function settingsToPolicy(settings: QuantityPriceSettings, bounds: Record<string, { minUsdPerKg: number; maxUsdPerKg: number }> = {}) {
  return { maxTiers: settings.max_tiers, maxPriceRatio: settings.max_price_ratio, maxLastMoqRatio: settings.max_last_moq_ratio, gradeBounds: bounds };
}
