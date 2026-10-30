export type SiteTrafficRow = { day: string; page_key: string; views: number };

/** Page views, not people or RFQ conversions. Supabase bigint may arrive as a string. */
export function buildSiteTrafficReport(rows: SiteTrafficRow[], days: 7 | 30 | 90, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const trend = Array.from({ length: days }, (_, index) => ({
    day: new Date(today - (days - index - 1) * 86400_000).toISOString().slice(0, 10), views: 0,
  }));
  const byDay = new Map(trend.map((item) => [item.day, item]));
  const pageViews = new Map<string, number>();
  for (const row of rows) {
    const bucket = byDay.get(row.day);
    const views = Number(row.views);
    if (!bucket || !Number.isSafeInteger(views) || views < 0) continue;
    bucket.views += views;
    pageViews.set(row.page_key, (pageViews.get(row.page_key) ?? 0) + views);
  }
  const sum = (key: string) => pageViews.get(key) ?? 0;
  const starts = (prefix: string) => [...pageViews.entries()].filter(([key]) => key.startsWith(prefix))
    .reduce((total, [, count]) => total + count, 0);
  const categories = starts("category:") + sum("cashew");
  const blog = sum("blog") + starts("article:");
  const info = sum("compare") + sum("for-suppliers") + sum("how-we-verify");
  const breakdown = [
    { key: "home", label: "Trang chủ", views: sum("home") },
    { key: "category", label: "Danh mục sản phẩm", views: categories },
    { key: "supplier", label: "Hồ sơ NCC", views: sum("supplier_profile") },
    { key: "product", label: "Chi tiết sản phẩm", views: sum("product_detail") },
    { key: "rfq", label: "Trang RFQ", views: sum("rfq") },
    { key: "blog", label: "Blog", views: blog },
    { key: "info", label: "Trang giới thiệu khác", views: info },
  ];
  const top = (prefix: string) => [...pageViews.entries()].filter(([key]) => key.startsWith(prefix))
    .map(([key, views]) => ({ slug: key.slice(prefix.length), views }))
    .sort((a, b) => b.views - a.views || a.slug.localeCompare(b.slug)).slice(0, 5);
  const categoryRanks = new Map([...pageViews.entries()].filter(([key]) => key.startsWith("category:"))
    .map(([key, views]) => [key.slice(9), views]));
  if (sum("cashew")) categoryRanks.set("cashew", (categoryRanks.get("cashew") ?? 0) + sum("cashew"));
  const topCategories = [...categoryRanks].map(([slug, views]) => ({ slug, views }))
    .sort((a, b) => b.views - a.views || a.slug.localeCompare(b.slug)).slice(0, 5);
  return {
    total: trend.reduce((value, row) => value + row.views, 0), trend, breakdown,
    topCategories, topArticles: top("article:"),
    supplierViews: sum("supplier_profile") + sum("product_detail"),
  };
}
