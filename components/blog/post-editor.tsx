"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { deletePostAction, savePostAction } from "@/app/blog-actions";
import { BlockEditor } from "@/components/block-editor/block-editor";
import type { Block } from "@/components/block-editor/types";
import { Button } from "@/components/editor-ui/button";
import { Input } from "@/components/editor-ui/input";
import { Label } from "@/components/editor-ui/label";
import { Textarea } from "@/components/editor-ui/textarea";
import { BLOG_CATEGORIES, DEFAULT_BLOG_CATEGORY } from "@/lib/blog/blog-categories";
import { slugify } from "@/lib/blog/post-payload";
import { blocksToPlainText } from "@/lib/blog/content-parsers";
import { normalizeBlocksFromStorage } from "@/lib/blog/blocks-from-storage";
import { runSeoChecks, type OtherPostRef, type SeoInput } from "@/lib/blog/seo-check";
import { SeoPanel } from "@/components/blog/seo-panel";
import { useImageDimensions } from "@/hooks/use-image-dimensions";
import type { Post, PostStatus } from "@/lib/types";

const MIN_PUBLISH_LENGTH = 50;

interface PostEditorProps {
  post: Post | null;
  /** Các bài khác trong mục, để kiểm tra trùng chủ đề */
  otherPosts: OtherPostRef[];
}

/** Trạng thái form ban đầu: lấy từ bài đã lưu, hoặc rỗng khi viết bài mới. */
function initialStateOf(post: Post | null) {
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    excerpt: post?.excerpt ?? "",
    category: post?.category ?? DEFAULT_BLOG_CATEGORY,
    featuredImage: post?.featured_image ?? "",
    featuredImageAlt: post?.featured_image_alt ?? "",
    metaTitle: post?.meta_title ?? "",
    metaDescription: post?.meta_description ?? "",
    focusKeyword: post?.focus_keyword ?? "",
    status: (post?.status ?? "draft") as PostStatus,
  };
}

export function PostEditor({ post, otherPosts }: PostEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [postId, setPostId] = useState<string | null>(post?.id ?? null);

  const initial = useMemo(() => initialStateOf(post), [post]);
  // Khối nội dung chỉ đọc một lần khi mở trang; sau đó BlockEditor tự quản lý
  const [initialBlocks] = useState<Block[]>(() => normalizeBlocksFromStorage(post?.content));

  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [category, setCategory] = useState(initial.category);
  const [featuredImage, setFeaturedImage] = useState(initial.featuredImage);
  const [featuredImageAlt, setFeaturedImageAlt] = useState(initial.featuredImageAlt);
  const [metaTitle, setMetaTitle] = useState(initial.metaTitle);
  const [metaDescription, setMetaDescription] = useState(initial.metaDescription);
  const [focusKeyword, setFocusKeyword] = useState(initial.focusKeyword);
  const [status, setStatus] = useState<PostStatus>(initial.status);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);

  const plainLength = useMemo(() => blocksToPlainText(blocks).trim().length, [blocks]);

  // Kiểm tra SEO: chờ 400ms sau khi ngừng gõ rồi mới tính lại
  const coverDimensions = useImageDimensions(featuredImage || null);
  const seoInput = useMemo<Omit<SeoInput, "now">>(
    () => ({
      title,
      metaTitle,
      metaDescription,
      excerpt,
      slug: slugTouched ? slug : slugify(title),
      focusKeyword,
      featuredImage,
      featuredImageAlt,
      coverWidth: coverDimensions?.width ?? null,
      blocks,
      published: status === "published",
      updatedAt: post?.updated_at ?? null,
      currentId: postId,
      otherPosts,
    }),
    [title, metaTitle, metaDescription, excerpt, slug, slugTouched, focusKeyword, featuredImage, featuredImageAlt, coverDimensions, blocks, status, post, postId, otherPosts],
  );
  const [debouncedSeo, setDebouncedSeo] = useState(seoInput);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSeo(seoInput), 400);
    return () => window.clearTimeout(timer);
  }, [seoInput]);
  const seoReport = useMemo(() => runSeoChecks({ ...debouncedSeo, now: new Date() }), [debouncedSeo]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const buildBody = (nextStatus: PostStatus) => ({
    title,
    slug: slugTouched ? slug : slugify(title),
    excerpt,
    category,
    content: blocks,
    featured_image: featuredImage,
    featured_image_alt: featuredImageAlt,
    meta_title: metaTitle,
    meta_description: metaDescription,
    focus_keyword: focusKeyword,
    status: nextStatus,
  });

  const save = (nextStatus: PostStatus) => {
    setMessage(null);
    if (nextStatus === "published" && plainLength < MIN_PUBLISH_LENGTH) {
      setMessage({
        kind: "error",
        text: `Nội dung quá ngắn để xuất bản (cần tối thiểu ${MIN_PUBLISH_LENGTH} ký tự)`,
      });
      return;
    }
    startTransition(async () => {
      const result = await savePostAction(postId, buildBody(nextStatus));
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      setStatus(result.post.status);
      setSlug(result.post.slug);
      setMessage({
        kind: "ok",
        text: result.post.status === "published" ? "Đã xuất bản bài viết." : "Đã lưu bản nháp.",
      });
      if (!postId) {
        setPostId(result.post.id);
        router.replace(`/posts/${result.post.id}`);
      }
    });
  };

  const remove = () => {
    if (!postId) return;
    if (!window.confirm("Xóa bài viết này? Hành động không thể hoàn tác.")) return;
    startTransition(async () => {
      const result = await deletePostAction(postId);
      if (!result.ok) {
        setMessage({ kind: "error", text: result.message });
        return;
      }
      router.push("/posts");
      router.refresh();
    });
  };

  const uploadCover = async (file: File) => {
    setMessage(null);
    if (!file.type.startsWith("image/")) {
      setMessage({ kind: "error", text: "Vui lòng chọn tệp ảnh (JPG, PNG, WebP, GIF, AVIF)." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ kind: "error", text: "Ảnh vượt quá 5MB, vui lòng chọn ảnh nhỏ hơn." });
      return;
    }
    setUploadingCover(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: formData });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setMessage({ kind: "error", text: data.error || "Không tải được ảnh lên." });
        return;
      }
      setFeaturedImage(data.url);
      if (!featuredImageAlt) setFeaturedImageAlt(title);
    } catch {
      setMessage({ kind: "error", text: "Mất kết nối khi tải ảnh. Vui lòng thử lại." });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const titleLength = (metaTitle || title).length;
  const descriptionLength = (metaDescription || excerpt).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/posts" className="text-[13px] font-semibold text-ink-500 hover:text-ink-900">
          ← Danh sách bài viết
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {postId && (
            <Button type="button" variant="outline" onClick={remove} disabled={isPending}>
              Xóa
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => save("draft")} disabled={isPending}>
            Lưu nháp
          </Button>
          <Button type="button" onClick={() => save("published")} disabled={isPending}>
            {status === "published" ? "Cập nhật" : "Xuất bản"}
          </Button>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={
            message.kind === "ok"
              ? "rounded-md border border-brand-600/30 bg-brand-600/5 px-3 py-2 text-[13px] text-brand-700"
              : "rounded-md border border-red-600/30 bg-red-600/5 px-3 py-2 text-[13px] text-red-600"
          }
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="card space-y-4 p-5">
            <div>
              <Label htmlFor="post-title">Tiêu đề</Label>
              <Input
                id="post-title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Tiêu đề bài viết"
                className="mt-1 text-lg font-semibold"
              />
            </div>
            <div>
              <Label htmlFor="post-excerpt">Mô tả ngắn</Label>
              <Textarea
                id="post-excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                placeholder="Một hai câu tóm tắt bài viết, hiển thị ở trang danh sách"
                className="mt-1"
              />
            </div>
          </section>

          <section className="card p-5">
            <BlockEditor value={initialBlocks} onChange={setBlocks} />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card space-y-4 p-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-500">Kiểm tra SEO</h2>
            <SeoPanel report={seoReport} />
          </section>

          <section className="card space-y-4 p-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-500">Xuất bản</h2>
            <div>
              <Label htmlFor="post-category">Mục</Label>
              <select
                id="post-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-ink-300 bg-white px-2 text-[13px]"
              >
                {BLOG_CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="post-slug">Đường dẫn</Label>
              <div className="mt-1 flex items-center gap-1 text-[12px] text-ink-500">
                <span>/blog/</span>
                <Input
                  id="post-slug"
                  value={slugTouched ? slug : slugify(title)}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  className="h-8 text-[12px]"
                />
              </div>
            </div>
            <p className="text-[12px] text-ink-500">
              Trạng thái hiện tại: <strong className="text-ink-900">{status === "published" ? "Đã xuất bản" : "Bản nháp"}</strong>
              {" · "}Nội dung {plainLength} ký tự
            </p>
          </section>

          <section className="card space-y-4 p-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-500">Ảnh bìa</h2>
            {featuredImage ? (
              <div className="space-y-2">
                {/* Xem trước ảnh bìa */}
                <img src={featuredImage} alt={featuredImageAlt} className="w-full rounded-md border border-ink-200 object-cover" />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-8 text-[12px]" onClick={() => coverInputRef.current?.click()} disabled={uploadingCover}>
                    {uploadingCover ? "Đang tải…" : "Đổi ảnh"}
                  </Button>
                  <Button type="button" variant="ghost" className="h-8 text-[12px]" onClick={() => setFeaturedImage("")} disabled={uploadingCover}>
                    Gỡ ảnh
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="flex w-full flex-col items-center justify-center rounded-md border border-dashed border-ink-300 px-4 py-8 text-center text-[13px] text-ink-500 hover:border-ink-500 hover:text-ink-800 disabled:opacity-60"
              >
                <span className="font-semibold text-ink-800">{uploadingCover ? "Đang tải ảnh…" : "Tải ảnh bìa lên"}</span>
                <span className="mt-1 text-[12px]">JPG, PNG, WebP, GIF, AVIF · tối đa 5MB</span>
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadCover(file);
              }}
            />
            <div>
              <Label htmlFor="post-image-alt">Mô tả ảnh (alt)</Label>
              <Input
                id="post-image-alt"
                value={featuredImageAlt}
                onChange={(e) => setFeaturedImageAlt(e.target.value)}
                placeholder="Mô tả ngắn cho người khiếm thị và công cụ tìm kiếm"
                className="mt-1 h-8 text-[12px]"
              />
            </div>
          </section>

          <section className="card space-y-4 p-4">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-500">Tìm kiếm (SEO)</h2>
            <div>
              <Label htmlFor="post-focus">Từ khóa chính</Label>
              <Input
                id="post-focus"
                value={focusKeyword}
                onChange={(e) => setFocusKeyword(e.target.value)}
                className="mt-1 h-8 text-[12px]"
              />
            </div>
            <div>
              <Label htmlFor="post-meta-title">Meta title</Label>
              <Input
                id="post-meta-title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Để trống sẽ dùng tiêu đề bài"
                className="mt-1 h-8 text-[12px]"
              />
              <p className={`mt-1 text-[11px] ${titleLength > 60 ? "text-red-600" : "text-ink-400"}`}>{titleLength}/60 ký tự</p>
            </div>
            <div>
              <Label htmlFor="post-meta-desc">Meta description</Label>
              <Textarea
                id="post-meta-desc"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
                placeholder="Để trống sẽ dùng mô tả ngắn"
                className="mt-1 text-[12px]"
              />
              <p className={`mt-1 text-[11px] ${descriptionLength > 160 ? "text-red-600" : "text-ink-400"}`}>
                {descriptionLength}/160 ký tự
              </p>
            </div>
          </section>

          {postId && (
            <Link href={`/blog/${slug}`} target="_blank" className="block text-center text-[13px] font-semibold text-brand-700 hover:underline">
              Xem trang công khai
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
