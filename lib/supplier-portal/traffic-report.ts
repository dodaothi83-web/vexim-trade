export type TrafficRow = {
  day: string;
  page_kind: "profile" | "product";
  resource_id: string;
  views: number;
};

/** UTC date buckets; never infer unique visitors or RFQ conversions from page views. */
export function buildTrafficReport(rows: TrafficRow[], supplierId: string, days: 7 | 30 | 90, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dates = Array.from({ length: days }, (_, index) =>
    new Date(today - (days - index - 1) * 86400_000).toISOString().slice(0, 10));
  const daily = new Map(dates.map((day) => [day, { day, profile: 0, product: 0 }]));
  const products = new Map<string, number>();
  for (const row of rows) {
    const bucket = daily.get(row.day);
    if (!bucket || !Number.isSafeInteger(row.views) || row.views < 0) continue;
    if (row.page_kind === "profile" && row.resource_id === supplierId) bucket.profile += row.views;
    if (row.page_kind === "product") {
      bucket.product += row.views;
      products.set(row.resource_id, (products.get(row.resource_id) ?? 0) + row.views);
    }
  }
  const trend = [...daily.values()];
  const profile = trend.reduce((sum, d) => sum + d.profile, 0);
  const product = trend.reduce((sum, d) => sum + d.product, 0);
  return { trend, profile, product, total: profile + product,
    products: [...products].map(([id, views]) => ({ id, views })).sort((a, b) => b.views - a.views || a.id.localeCompare(b.id)) };
}
