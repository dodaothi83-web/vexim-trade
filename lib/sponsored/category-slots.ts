/** Display limits for a category, based on its public, non-demo catalogue before filters.
 * These are deployment settings, not the (currently separate) sales pool limit. */
export interface CategorySlotConfig {
  mediumFrom: number;
  largeFrom: number;
  smallSlots: number;
  mediumSlots: number;
  largeSlots: number;
}

export const DEFAULT_CATEGORY_SLOT_CONFIG: CategorySlotConfig = {
  mediumFrom: 10, largeFrom: 31, smallSlots: 1, mediumSlots: 2, largeSlots: 3,
};

export function categorySlotConfig(env: Record<string, string | undefined> = process.env): CategorySlotConfig {
  const number = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key];
    if (raw === undefined || raw === "") return fallback;
    if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) throw new Error(`Invalid ${key}`);
    return Number(raw);
  };
  const config = {
    mediumFrom: number("SPONSORED_CATEGORY_MEDIUM_FROM", 10, 1, 1000000),
    largeFrom: number("SPONSORED_CATEGORY_LARGE_FROM", 31, 2, 1000000),
    smallSlots: number("SPONSORED_CATEGORY_SMALL_SLOTS", 1, 1, 3),
    mediumSlots: number("SPONSORED_CATEGORY_MEDIUM_SLOTS", 2, 1, 3),
    largeSlots: number("SPONSORED_CATEGORY_LARGE_SLOTS", 3, 1, 3),
  };
  if (config.mediumFrom >= config.largeFrom || config.smallSlots > config.mediumSlots || config.mediumSlots > config.largeSlots) {
    throw new Error("Invalid sponsored category slot configuration");
  }
  return config;
}

export function categorySponsoredSlots(productCount: number, config: CategorySlotConfig = DEFAULT_CATEGORY_SLOT_CONFIG): number {
  if (!Number.isFinite(productCount) || productCount <= 0) return 0;
  if (productCount < config.mediumFrom) return config.smallSlots;
  if (productCount < config.largeFrom) return config.mediumSlots;
  return config.largeSlots;
}
