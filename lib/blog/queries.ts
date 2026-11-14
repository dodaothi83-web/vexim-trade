import "server-only";

import { unstable_cache } from "next/cache";

import { getStore } from "@/lib/db";
import type { Post } from "@/lib/types";
import { DEFAULT_BLOG_CATEGORY } from "@/lib/blog/blog-categories";
import { titleSimilarity } from "@/lib/blog/seo-check";

/**
 * Truy vấn bài viết cho trang công khai /blog.
 * Chỉ trả về bài đã xuất bản thuộc mục Tin tức của Veximtrade.
 */

/** Tag xoá cache bài viết: app/blog-actions.ts gọi khi lưu hoặc xoá bài. */
export const PUBLISHED_POSTS_TAG = "published-posts";

/**
 * Trang chủ và /blog đọc danh sách này ở mọi lượt xem. Cache 60 giây dùng chung cho mọi
 * người xem (bảng posts từng là một trong các truy vấn tốn nhất); lưu/xoá bài trong CRM xoá
 * cache ngay nên bài mới hiện ở lượt xem kế tiếp.
 */
const cachedPublishedNews = unstable_cache(async (): Promise<Post[]> => {
  const posts = await getStore().listPosts({ status: "published" });
  return posts
    .filter((post) => post.category === DEFAULT_BLOG_CATEGORY && post.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}, ["published-news"], { revalidate: 60, tags: [PUBLISHED_POSTS_TAG] });

export async function listPublishedNews(): Promise<Post[]> {
  return cachedPublishedNews();
}

/** Bài liên quan: cùng mục, giống tiêu đề nhất, rồi đến bài mới hơn. Không gồm bài hiện tại. */
export async function relatedNews(current: Post, limit = 3): Promise<Post[]> {
  const all = await listPublishedNews();
  return all
    .filter((post) => post.id !== current.id)
    .map((post) => ({ post, score: titleSimilarity(post.title, current.title) }))
    .sort((a, b) => b.score - a.score || (b.post.published_at ?? "").localeCompare(a.post.published_at ?? ""))
    .slice(0, limit)
    .map((item) => item.post);
}

export async function getPublishedNewsBySlug(slug: string): Promise<Post | null> {
  const post = await getStore().getPostBySlug(slug, { publishedOnly: true });
  if (!post || post.category !== DEFAULT_BLOG_CATEGORY) return null;
  return post;
}

/** Danh sách rút gọn mọi bài trong mục (cả nháp) để kiểm tra trùng chủ đề khi viết. */
export async function listNewsRefsForSeo(): Promise<{ id: string; title: string; slug: string; focus_keyword: string | null }[]> {
  const posts = await getStore().listPosts();
  return posts
    .filter((post) => post.category === DEFAULT_BLOG_CATEGORY)
    .map((post) => ({ id: post.id, title: post.title, slug: post.slug, focus_keyword: post.focus_keyword }));
}
