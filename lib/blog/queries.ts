import "server-only";

import { getStore } from "@/lib/db";
import type { Post } from "@/lib/types";
import { DEFAULT_BLOG_CATEGORY } from "@/lib/blog/blog-categories";

/**
 * Truy vấn bài viết cho trang công khai /blog.
 * Chỉ trả về bài đã xuất bản thuộc mục Tin tức của Veximtrade.
 */

export async function listPublishedNews(): Promise<Post[]> {
  const posts = await getStore().listPosts({ status: "published" });
  return posts
    .filter((post) => post.category === DEFAULT_BLOG_CATEGORY && post.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
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
