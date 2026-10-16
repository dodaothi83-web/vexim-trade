import type { MetadataRoute } from "next";

import { listPublishedNews } from "@/lib/blog/queries";
import { getStore } from "@/lib/db";
import { listPublicSuppliers } from "@/lib/public/catalog";
import { SITE_URL } from "@/lib/site";

/** Làm mới danh sách sau tối đa 60 giây */
export const revalidate = 60;

const INDEXABLE = process.env.PUBLIC_SITE_INDEXABLE === "true";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Blog pages always stay crawlable (existing content, unchanged for MVP).
  const posts = await listPublishedNews().catch(() => []);
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
    return blogRoutes;
  }

  const store = getStore();
  const [categories, publishedSuppliers] = await Promise.all([
    store.listCategories({ publishedOnly: true }).catch(() => []),
    listPublicSuppliers().catch(() => []),
  ]);

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
    ...categories.map((c) => ({
      url: `${SITE_URL}/products/${c.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...publishedSuppliers.map((s) => ({
      url: `${SITE_URL}/suppliers/${s.slug}`,
      lastModified: s.updated_at ? new Date(s.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];

  return [...publicRoutes, ...blogRoutes];
}
