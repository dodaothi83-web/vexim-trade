import "server-only";

import { getSupabaseClient } from "@/lib/db/supabase";
import type { SiteTrafficRow } from "@/lib/traffic/site-report";

export async function recordSitePage(key: string): Promise<void> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Site traffic requires Supabase");
  const { error } = await db.rpc("record_vexim_site_page_view", { p_page_key: key });
  if (error) throw new Error(`record site traffic: ${error.message}`);
}

/** SQL aggregates the existing NCC profile/product counters with the other public routes. */
export async function readSiteTraffic(days: 7 | 30 | 90): Promise<SiteTrafficRow[] | null> {
  const db = getSupabaseClient();
  if (!db) return null;
  const rows: SiteTrafficRow[] = [];
  // PostgREST often caps one response at 1,000 rows; published articles/categories can exceed it.
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.rpc("read_vexim_site_traffic", { p_days: days })
      .order("day").order("page_key").range(start, start + 999);
    if (error) throw new Error(`read site traffic: ${error.message}`);
    rows.push(...((data ?? []) as SiteTrafficRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
