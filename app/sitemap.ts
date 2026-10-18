import type { MetadataRoute } from "next";

import { listPublishedNews } from "@/lib/blog/queries";
import { getStore } from "@/lib/db";
import { getPublicSupplierBySlug, listPublicSuppliers, type PublicSupplierCard } from "@/lib/public/catalog";
import { supplierProfileIndexable } from "@/lib/public/supplier-seo";
import { SITE_URL } from "@/lib/site";

/** Làm mới danh sách sau tối đa 60 giây */
export const revalidate = 60;

const INDEXABLE = process.env.PUBLIC_SITE_INDEXABLE === "true";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Blog pages always stay crawlable (existing content, unchanged for MVP).
  const posts = await listPublishedNews().catch(() => []);
  const legalRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/privacy-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms-of-service`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/thong-tin-chu-quan`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/quy-che-hoat-dong`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/dieu-khoan-su-dung`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/chinh-sach-bao-mat`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/khieu-nai`, changeFrequency: "yearly", priority: 0.3 },
  ];
  const blogRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/blog`,
      lastModified: posts[0]?.updated_at ? new Date(posts[0].updated_at) : new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(post.updated_at),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  if (!INDEXABLE) {
    // Pre-launch / staging: don't advertise landing or public-catalog pages.
    return [...legalRoutes, ...blogRoutes];
  }

  const store = getStore();
  const [categories, publishedSuppliers] = await Promise.all([
    store.listCategories({ publishedOnly: true }).catch(() => []),
    listPublicSuppliers().catch(() => []),
  ]);

  // Directory cards do not check product media. Confirm the actual public profile
  // before advertising it to crawlers; a test or catalogue-only empty profile stays out.
  const searchableSuppliers: PublicSupplierCard[] = [];
  for (let i = 0; i < publishedSuppliers.length; i += 20) {
    const batch = await Promise.all(publishedSuppliers.slice(i, i + 20)
      .filter(supplierProfileIndexable)
      .map(async (s) => {
        const detail = await getPublicSupplierBySlug(s.slug || s.id, publishedSuppliers).catch(() => null);
        return detail && supplierProfileIndexable(detail) ? s : null;
      }));
    searchableSuppliers.push(...batch.filter((s): s is (typeof publishedSuppliers)[number] => s !== null));
  }

  const publicRoutes: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/how-we-verify`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/for-suppliers`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    ...categories.filter((c) => c.seo_indexable).map((c) => ({
      url: `${SITE_URL}/products/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...searchableSuppliers.map((s) => ({
      url: `${SITE_URL}/suppliers/${s.slug}`,
      lastModified: s.updated_at ? new Date(s.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];

  return [...publicRoutes, ...blogRoutes, ...legalRoutes];
}
