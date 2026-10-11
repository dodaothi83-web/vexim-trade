import type { MetadataRoute } from "next";

import { listPublishedNews } from "@/lib/blog/queries";
import { SITE_URL } from "@/lib/site";

/** Làm mới danh sách bài viết trong sitemap sau tối đa 60 giây */
export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listPublishedNews();

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
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
}
