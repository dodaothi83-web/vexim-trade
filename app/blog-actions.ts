"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "@/lib/db";
import { guard } from "@/lib/auth/session";
import { buildPostPayload, ensureUniqueSlug, slugify } from "@/lib/blog/post-payload";
import type { Post, PostInput } from "@/lib/types";

export type BlogActionResult = { ok: true; post: Post } | { ok: false; message: string };

/** Xuất bản cần nội dung thực sự, tránh đăng bài rỗng (đồng bộ với module gốc) */
const MIN_PUBLISH_CHARS = 50;

function refreshPublicPages(slug?: string) {
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/blog/${slug}`);
}

/**
 * Tạo hoặc sửa bài viết. Chỉ người có quyền blog.manage.
 * Dữ liệu đi qua whitelist buildPostPayload trước khi ghi.
 */
export async function savePostAction(
  id: string | null,
  body: Record<string, unknown>,
): Promise<BlogActionResult> {
  const gate = await guard("blog.manage");
  if (gate) return gate;

  const store = getStore();
  const built = buildPostPayload(body, { partial: id !== null });
  if (built.errors.length > 0) return { ok: false, message: built.errors.join(". ") };

  const status = built.payload.status === "published" ? "published" : "draft";
  if (status === "published" && built.plainTextLength < MIN_PUBLISH_CHARS) {
    return {
      ok: false,
      message: `Nội dung quá ngắn để xuất bản (cần tối thiểu ${MIN_PUBLISH_CHARS} ký tự)`,
    };
  }

  try {
    if (id === null) {
      const title = String(built.payload.title ?? "");
      const baseSlug = String(built.payload.slug ?? "") || slugify(title);
      const slug = await ensureUniqueSlug(store, baseSlug);
      const input: PostInput = {
        title,
        slug,
        excerpt: String(built.payload.excerpt ?? "") || null,
        content: String(built.payload.content ?? "[]"),
        category: String(built.payload.category ?? ""),
        featured_image: String(built.payload.featured_image ?? "") || null,
        featured_image_alt: String(built.payload.featured_image_alt ?? "") || null,
        meta_title: String(built.payload.meta_title ?? "") || null,
        meta_description: String(built.payload.meta_description ?? "") || null,
        focus_keyword: String(built.payload.focus_keyword ?? "") || null,
        status,
        published_at: status === "published" ? new Date().toISOString() : null,
      };
      const post = await store.createPost(input);
      refreshPublicPages(post.slug);
      return { ok: true, post };
    }

    const current = await store.getPost(id);
    if (!current) return { ok: false, message: "Không tìm thấy bài viết." };

    const patch: Partial<PostInput> = { ...built.payload } as Partial<PostInput>;
    if ("slug" in built.payload || "title" in built.payload) {
      const baseSlug = String(built.payload.slug ?? "") || slugify(String(built.payload.title ?? current.title));
      patch.slug = await ensureUniqueSlug(store, baseSlug, id);
    }
    // Lần đầu xuất bản thì ghi ngày xuất bản; các lần sau giữ nguyên
    if (status === "published" && !current.published_at) {
      patch.published_at = new Date().toISOString();
    }
    if (status === "draft") patch.published_at = current.published_at;

    const post = await store.updatePost(id, patch);
    refreshPublicPages(current.slug);
    refreshPublicPages(post.slug);
    return { ok: true, post };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Không lưu được bài viết.",
    };
  }
}

/** Xóa bài viết. Chỉ người có quyền blog.manage. */
export async function deletePostAction(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const gate = await guard("blog.manage");
  if (gate) return gate;
  const store = getStore();
  try {
    const current = await store.getPost(id);
    await store.deletePost(id);
    refreshPublicPages(current?.slug);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Không xóa được bài viết.",
    };
  }
}
