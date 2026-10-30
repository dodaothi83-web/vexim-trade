import "server-only";
import { readGradePriceBounds, readQuantityPriceSettings } from "@/lib/products/quantity-price-config";
import { settingsToPolicy } from "@/lib/products/quantity-price-settings";
import type { QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

/** Read live settings; never replace a failed database read with defaults. */
export async function readNewQuantityPolicies(categories: CategoryProposalOption[]): Promise<Record<string, QuantityPricingPolicy>> {
  const [settings, bounds] = await Promise.all([readQuantityPriceSettings(), readGradePriceBounds()]);
  return Object.fromEntries(categories.map((category) => [category.slug, settingsToPolicy(settings,
    Object.fromEntries(bounds.filter((row) => row.category_id === category.id)
      .map((row) => [row.grade, { minUsdPerKg: row.min_usd_per_kg, maxUsdPerKg: row.max_usd_per_kg }])))]));
}
