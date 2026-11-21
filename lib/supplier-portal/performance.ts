import "server-only";

import { getSupabaseClient } from "@/lib/db/supabase";
import { periodRanges } from "./traffic-report";

/**
 * Số liệu hiệu quả cho nhà cung cấp (trang "Lượt xem gian hàng" và email báo cáo hằng tuần):
 * lượt xem kỳ này và kỳ trước, RFQ nhận được, lượt bấm từ email marketing của Vexim, quốc gia xem
 * nhiều nhất. Chỉ số tổng; không có danh tính người xem hay người mua.
 */
export type SupplierPerformance = {
  views: { current: number; previous: number };
  rfqs: { current: number; previous: number };
  emailClicks: number;
  countries: Array<{ code: string; views: number }>;
};

type Range = { from: string; to: string };

async function sumViews(supplierId: string, range: Range): Promise<number> {
  const db = getSupabaseClient()!;
  let total = 0;
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from("supplier_traffic_daily").select("views").eq("supplier_id", supplierId)
      .gte("day", range.from).lte("day", range.to).range(start, start + 999);
    if (error) throw error;
    total += (data ?? []).reduce((n, r) => n + Number(r.views), 0);
    if (!data || data.length < 1000) break;
  }
  return total;
}

/** RFQ đã chuyển tới nhà cung cấp trong kỳ. */
async function countRfqs(supplierId: string, range: Range): Promise<number> {
  const db = getSupabaseClient()!;
  const { count, error } = await db.from("rfq_matches").select("id", { count: "exact", head: true }).eq("supplier_id", supplierId)
    .gte("sent_to_supplier_at", `${range.from}T00:00:00Z`).lte("sent_to_supplier_at", `${range.to}T23:59:59.999Z`);
  if (error) throw error;
  return count ?? 0;
}

async function emailClicks(supplierId: string, range: Range): Promise<number> {
  const db = getSupabaseClient()!;
  const { data, error } = await db.from("buyer_digest_clicks_daily").select("clicks").eq("supplier_id", supplierId)
    .gte("day", range.from).lte("day", range.to);
  if (error) { console.error("[performance] email clicks", error.message); return 0; }
  return (data ?? []).reduce((n, r) => n + Number(r.clicks), 0);
}

async function countries(supplierId: string, range: Range): Promise<Array<{ code: string; views: number }>> {
  const db = getSupabaseClient()!;
  const { data, error } = await db.from("supplier_traffic_country_daily").select("country, views").eq("supplier_id", supplierId)
    .gte("day", range.from).lte("day", range.to);
  if (error) { console.error("[performance] countries", error.message); return []; }
  const totals = new Map<string, number>();
  for (const row of data ?? []) totals.set(row.country, (totals.get(row.country) ?? 0) + Number(row.views));
  return [...totals].map(([code, views]) => ({ code, views })).sort((a, b) => b.views - a.views || a.code.localeCompare(b.code));
}

export async function readSupplierPerformance(supplierId: string, days: number, now = new Date()): Promise<SupplierPerformance | null> {
  if (!getSupabaseClient()) return null;
  const { current, previous } = periodRanges(days, now);
  const [viewsNow, viewsBefore, rfqNow, rfqBefore, clicks, byCountry] = await Promise.all([
    sumViews(supplierId, current), sumViews(supplierId, previous), countRfqs(supplierId, current), countRfqs(supplierId, previous),
    emailClicks(supplierId, current), countries(supplierId, current),
  ]);
  return { views: { current: viewsNow, previous: viewsBefore }, rfqs: { current: rfqNow, previous: rfqBefore }, emailClicks: clicks, countries: byCountry };
}
