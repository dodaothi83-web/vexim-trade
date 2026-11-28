import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { blocksToHTML } from "@/lib/blocks-to-html";
import { ensureHeadingAnchors } from "@/lib/blog/heading-anchors";
import { normalizeBlocksFromStorage } from "@/lib/blog/blocks-from-storage";
import { getPublishedPostBySlug, relatedNews } from "@/lib/blog/queries";
import { getBlogCategory, VI_EXPORT_BLOG_CATEGORY } from "@/lib/blog/blog-categories";
import { ArticleToc } from "@/components/blog/article-toc";
import { SupplierCta } from "@/components/blog/supplier-cta";
import { COMPANY } from "@/lib/config";
import { pageTitle, SITE_NAME, SITE_URL } from "@/lib/site";

/** ISR: làm mới bài viết sau tối đa 60 giây */
export const revalidate = 60;

/** Bài tiếng Việt mục Kiến thức xuất khẩu: cùng bố cục với bài News, câu chữ và lời kêu gọi cho doanh nghiệp Việt. */
const category = getBlogCategory(VI_EXPORT_BLOG_CATEGORY)!;
const getPost = (slug: string) => getPublishedPostBySlug(VI_EXPORT_BLOG_CATEGORY, slug);

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("vi-VN", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Không tìm thấy bài viết" };

  const title = post.meta_title || post.title;
  const description = post.meta_description || post.excerpt || undefined;
  const url = `${SITE_URL}${category.basePath}/${post.slug}`;

  return {
    // absolute: không để layout CRM thêm hậu tố "· Vexim Trade CRM"
    title: pageTitle(title),
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: SITE_NAME,
      locale: "vi_VN",
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      images: post.featured_image ? [{ url: post.featured_image, alt: post.featured_image_alt ?? title }] : undefined,
    },
  };
}

/** Chuỗi JSON-LD an toàn để nhúng vào thẻ script */
function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function ViExportPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const blocks = normalizeBlocksFromStorage(post.content);
  const { html, headings } = ensureHeadingAnchors(blocksToHTML(blocks));
  const related = await relatedNews(post);

  const url = `${SITE_URL}${category.basePath}/${post.slug}`;
  const headline = post.meta_title || post.title;
  const description = post.meta_description || post.excerpt || undefined;

  // Tác giả: chỉ dùng tên đã nhập; chưa có thì ghi nhận là Vexim Trade (không bịa tên)
  const authorName = post.author_name?.trim() || SITE_NAME;

  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    inLanguage: "vi",
    headline,
    description,
    image: post.featured_image ? [post.featured_image] : undefined,
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: authorName, url: SITE_URL },
    publisher: { "@type": "Organization", name: COMPANY.name, url: SITE_URL },
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Trang chủ", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: category.title, item: `${SITE_URL}${category.basePath}` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  const toc = headings.map((h) => ({ id: h.id, text: h.text, level: h.level }));
  const showToc = toc.length > 1;

  return (
    <article lang="vi" className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(blogPosting) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs) }} />

      <div className="min-w-0 max-w-[680px]">
        <nav className="text-[13px] text-ink-500">
          <Link href={category.basePath} className="hover:text-ink-900">Kiến thức xuất khẩu</Link>
          <span className="mx-2">/</span>
          <span className="text-ink-700">{post.title}</span>
        </nav>

        <header className="mt-6">
          <h1 className="mt-2 text-[34px] leading-tight font-black tracking-tight md:text-[42px]">{post.title}</h1>
          {post.excerpt && <p className="mt-4 text-[18px] leading-relaxed text-ink-600">{post.excerpt}</p>}
          <p className="mt-5 text-[14px] text-ink-600">
            Tác giả <span className="font-semibold text-ink-800">{authorName}</span>
            {post.reviewer_name?.trim() && (
              <>
                <span className="mx-2">·</span>Người kiểm duyệt <span className="font-semibold text-ink-800">{post.reviewer_name.trim()}</span>
              </>
            )}
            <span className="mx-2">·</span>
            Đăng ngày <time dateTime={post.published_at ?? post.created_at}>{formatDate(post.published_at ?? post.created_at)}</time>
            {post.updated_at && post.published_at && post.updated_at.slice(0, 10) !== post.published_at.slice(0, 10) && (
              <>
                <span className="mx-2">·</span>
                Cập nhật <time dateTime={post.updated_at}>{formatDate(post.updated_at)}</time>
              </>
            )}
          </p>
        </header>

        {post.featured_image && (
          <img
            src={post.featured_image}
            alt={post.featured_image_alt ?? post.title}
            fetchPriority="high"
            decoding="async"
            className="mt-8 w-full rounded-lg object-cover"
          />
        )}

        {/* Điện thoại và máy tính bảng: mục lục thu gọn ngay đầu bài */}
        {showToc && (
          <details className="mt-8 rounded-lg border border-ink-200 p-5 lg:hidden">
            <summary className="cursor-pointer text-[13px] font-bold uppercase tracking-wide text-ink-500">
              Nội dung bài
            </summary>
            <nav aria-label="Mục lục" className="mt-3">
              <ArticleToc headings={toc} />
            </nav>
          </details>
        )}

        <div
          className="blog-prose mt-10 max-w-none text-[17px] leading-[1.75] text-ink-800"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <SupplierCta className="mt-12 lg:hidden" />

        {related.length > 0 && (
          <section className="mt-14 border-t border-ink-200 pt-8" aria-labelledby="related-heading">
            <h2 id="related-heading" className="text-[13px] font-bold uppercase tracking-wide text-ink-500">
              Bài liên quan
            </h2>
            <ul className="mt-4 divide-y divide-ink-100">
              {related.map((item) => (
                <li key={item.id} className="py-4">
                  <p className="text-[12px] font-semibold text-brand-700">{formatDate(item.published_at)}</p>
                  <Link href={`${category.basePath}/${item.slug}`} className="mt-1 block text-[17px] leading-snug font-bold hover:text-brand-700">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-14 border-t border-ink-200 pt-6 text-[14px] text-ink-600">
          <Link href={category.basePath} className="font-semibold text-brand-700 hover:underline">
            ← Bài khác
          </Link>
        </footer>
      </div>

      {/* Máy tính: sidebar dính khi cuộn, chỉ gồm mục lục và lời kêu gọi */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-6">
          {showToc && (
            <nav aria-label="Mục lục" className="rounded-lg border border-ink-200 p-5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">Nội dung bài</p>
              <div className="mt-3 max-h-[60vh] overflow-y-auto pr-1">
                <ArticleToc headings={toc} />
              </div>
            </nav>
          )}
          <SupplierCta />
        </div>
      </aside>
    </article>
  );
}
