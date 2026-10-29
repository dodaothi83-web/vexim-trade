import "server-only";
import { getSupabaseClient } from "@/lib/db/supabase";
import { parseQuantityPriceSettings, settingsToPolicy, type QuantityPriceSettings } from "@/lib/products/quantity-price-settings";
import type { QuantityPricingPolicy } from "@/lib/products/quantity-pricing";

export type GradePriceBoundRecord = { category_id: string; grade: string; min_usd_per_kg: number; max_usd_per_kg: number };

/** Never silently substitute defaults on a live read: a missing migration or failed
 * database query must not allow offers to bypass configured checks. */
export async function readQuantityPriceSettings(): Promise<QuantityPriceSettings> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Quantity pricing database unavailable");
  const { data, error } = await db.from("quantity_price_settings").select("*").eq("singleton", true).single();
  if (error || !data) throw new Error(`Quantity pricing settings unavailable: ${error?.message ?? "missing row"}`);
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, String(value));
  const settings = parseQuantityPriceSettings(fd);
  if (!settings) throw new Error("Quantity pricing settings are invalid");
  return settings;
}

export async function readGradePriceBounds(categoryId?: string): Promise<GradePriceBoundRecord[]> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Quantity pricing database unavailable");
  const out: GradePriceBoundRecord[] = [];
  for (let start = 0; ; start += 500) {
    let query = db.from("category_grade_price_bounds").select("category_id,grade,min_usd_per_kg,max_usd_per_kg");
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data, error } = await query.order("category_id").order("grade").range(start, start + 499);
    if (error || !data) throw new Error(`Grade bounds unavailable: ${error?.message ?? "no data"}`);
    for (const item of data) {
      const min = Number(item.min_usd_per_kg), max = Number(item.max_usd_per_kg);
      if (typeof item.category_id !== "string" || typeof item.grade !== "string" || !item.grade.trim() ||
          !Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) throw new Error("Invalid grade price bounds");
      out.push({ category_id: item.category_id, grade: item.grade, min_usd_per_kg: min, max_usd_per_kg: max });
    }
    if (data.length < 500) break;
  }
  return out;
}

export async function readQuantityPricingPolicy(categoryId: string): Promise<QuantityPricingPolicy> {
  if (!categoryId) throw new Error("Missing category for quantity pricing policy");
  const [settings, rows] = await Promise.all([readQuantityPriceSettings(), readGradePriceBounds(categoryId)]);
  const bounds = Object.fromEntries(rows.map((row) => [row.grade, { minUsdPerKg: row.min_usd_per_kg, maxUsdPerKg: row.max_usd_per_kg }]));
  return settingsToPolicy(settings, bounds);
}
