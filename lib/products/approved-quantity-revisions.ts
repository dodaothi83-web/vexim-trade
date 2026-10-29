import "server-only";
import { getSupabaseClient } from "@/lib/db/supabase";
import type { NameRevision, PriceRevision } from "@/lib/products/quantity-public-projection";

export type ApprovedQuantityRevisions = { price: PriceRevision | null; name: NameRevision | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 50;

/**
 * Server-side only. Caller supplies IDs that already passed product/supplier gates;
 * this function never queries pending revisions or projects internal warnings.
 * Errors propagate instead of silently falling back to stale legacy prices.
 */
export async function readApprovedQuantityRevisions(productIds: readonly string[]): Promise<Map<string, ApprovedQuantityRevisions>> {
  const ids = [...new Set(productIds)];
  if (ids.some((id) => !UUID.test(id))) throw new Error("Invalid product ID for quantity pricing");
  const result = new Map(ids.map((id) => [id, { price: null, name: null } as ApprovedQuantityRevisions]));
  if (!ids.length) return result;
  const db = getSupabaseClient();
  if (!db) throw new Error("Quantity pricing database unavailable");
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    const [prices, names] = await Promise.all([
      db.from("product_quantity_price_revisions").select("product_id,status,grade,incoterm,tiers,confirmed_at").eq("status", "approved").in("product_id", batch),
      db.from("product_english_name_revisions").select("product_id,status,english_name").eq("status", "approved").in("product_id", batch),
    ]);
    if (prices.error || names.error || !prices.data || !names.data) throw new Error(`Approved quantity revisions unavailable: ${prices.error?.message ?? names.error?.message ?? "no data"}`);
    for (const price of prices.data as PriceRevision[]) {
      const entry = result.get(price.product_id);
      if (!entry || !batch.includes(price.product_id) || price.status !== "approved" || entry.price) throw new Error("Unexpected price revision in public projection");
      entry.price = price;
    }
    for (const name of names.data as NameRevision[]) {
      const entry = result.get(name.product_id);
      if (!entry || !batch.includes(name.product_id) || name.status !== "approved" || entry.name) throw new Error("Unexpected name revision in public projection");
      entry.name = name;
    }
  }
  return result;
}
