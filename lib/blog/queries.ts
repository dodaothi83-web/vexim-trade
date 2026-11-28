import "server-only";

import { unstable_cache } from "next/cache";

import { getStore } from "@/lib/db";
import type { Post } from "@/lib/types";
import { DEFAULT_BLOG_CATEGORY, VI_EXPORT_BLOG_CATEGORY } from "@/lib/blog/blog-categories";
import { titleSimilarity } from "@/lib/blog/seo-check";

/**
 * Truy vấn bài viết cho trang công khai /blog.
 * Chỉ trả về bài đã xuất bản thuộc mục Tin tức của Vexim Trade.
 */

/** Tag xoá cache bài viết: app/blog-actions.ts gọi khi lưu hoặc xoá bài. */
export const PUBLISHED_POSTS_TAG = "published-posts";

/**
 * Trang chủ và /blog đọc danh sách này ở mọi lượt xem. Cache 1 giờ dùng chung cho mọi người
 * xem, khớp trang chủ ISR 1 giờ (cache ngắn hơn sẽ kéo trang chủ xuống làm mới theo); lưu/xoá
 * bài trong CRM xoá cache ngay nên bài mới hiện ở lượt xem kế tiếp.
 */
const cachedPublishedPosts = unstable_cache(async (): Promise<Post[]> => {
  const posts = await getStore().listPosts({ status: "published" });
  return posts
    .filter((post) => post.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
}, ["published-posts-all"], { revalidate: 3600, tags: [PUBLISHED_POSTS_TAG] });

/** Bài đã xuất bản của một mục, mới nhất trước. */
export async function listPublishedPosts(category: string): Promise<Post[]> {
  return (await cachedPublishedPosts()).filter((post) => post.category === category);
}

export async function listPublishedNews(): Promise<Post[]> {
  return listPublishedPosts(DEFAULT_BLOG_CATEGORY);
}

/** Bài mục Kiến thức xuất khẩu (tiếng Việt, cho doanh nghiệp Việt). */
export async function listPublishedViExport(): Promise<Post[]> {
  return listPublishedPosts(VI_EXPORT_BLOG_CATEGORY);
}

/** Bài liên quan: cùng mục, giống tiêu đề nhất, rồi đến bài mới hơn. Không gồm bài hiện tại. */
export async function relatedNews(current: Post, limit = 3): Promise<Post[]> {
  const all = await listPublishedPosts(current.category);
  return all
    .filter((post) => post.id !== current.id)
    .map((post) => ({ post, score: titleSimilarity(post.title, current.title) }))
    .sort((a, b) => b.score - a.score || (b.post.published_at ?? "").localeCompare(a.post.published_at ?? ""))
    .slice(0, limit)
    .map((item) => item.post);
}

/** Bài đã xuất bản theo slug, chỉ khi thuộc đúng mục (một slug không mở được ở mục khác). */
export async function getPublishedPostBySlug(category: string, slug: string): Promise<Post | null> {
  const post = await getStore().getPostBySlug(slug, { publishedOnly: true });
  if (!post || post.category !== category) return null;
  return post;
}

export async function getPublishedNewsBySlug(slug: string): Promise<Post | null> {
  return getPublishedPostBySlug(DEFAULT_BLOG_CATEGORY, slug);
}

/** Danh sách rút gọn mọi bài (cả nháp) để kiểm tra trùng chủ đề khi viết; trình soạn lọc theo mục đang chọn. */
export async function listNewsRefsForSeo(): Promise<{ id: string; title: string; slug: string; focus_keyword: string | null; category: string }[]> {
  const posts = await getStore().listPosts();
  return posts.map((post) => ({ id: post.id, title: post.title, slug: post.slug, focus_keyword: post.focus_keyword, category: post.category }));
}
