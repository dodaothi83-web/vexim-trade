import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { blocksToHTML } from "@/lib/blocks-to-html";
import { ensureHeadingAnchors } from "@/lib/blog/heading-anchors";
import { normalizeBlocksFromStorage } from "@/lib/blog/blocks-from-storage";
import { getPublishedNewsBySlug, relatedNews } from "@/lib/blog/queries";
import { ArticleToc } from "@/components/blog/article-toc";
import { ArticleCta } from "@/components/blog/article-cta";
import { COMPANY } from "@/lib/config";
import { SITE_URL } from "@/lib/site";

/** ISR: làm mới bài viết sau tối đa 60 giây */
export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedNewsBySlug(slug);
  if (!post) return { title: "Article not found" };

  const title = post.meta_title || post.title;
  const description = post.meta_description || post.excerpt || undefined;
  const url = `${SITE_URL}/blog/${post.slug}`;

  return {
    // absolute: không để layout CRM thêm hậu tố "· Vexim Trade CRM"
    title: { absolute: `${title} | Veximtrade` },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      siteName: "Veximtrade",
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

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPublishedNewsBySlug(slug);
  if (!post) notFound();

  const blocks = normalizeBlocksFromStorage(post.content);
  const { html, headings } = ensureHeadingAnchors(blocksToHTML(blocks));
  const related = await relatedNews(post);

  const url = `${SITE_URL}/blog/${post.slug}`;
  const headline = post.meta_title || post.title;
  const description = post.meta_description || post.excerpt || undefined;

  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline,
    description,
    image: post.featured_image ? [post.featured_image] : undefined,
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: COMPANY.name, url: SITE_URL },
    publisher: { "@type": "Organization", name: COMPANY.name, url: SITE_URL },
  };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "News", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  const toc = headings.map((h) => ({ id: h.id, text: h.text, level: h.level }));
  const showToc = toc.length > 1;

  return (
    <article className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(blogPosting) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs) }} />

      <div className="min-w-0 max-w-[680px]">
        <nav className="text-[13px] text-ink-500">
          <Link href="/blog" className="hover:text-ink-900">News</Link>
          <span className="mx-2">/</span>
          <span className="text-ink-700">{post.title}</span>
        </nav>

        <header className="mt-6">
          <p className="text-[13px] font-semibold text-brand-700">{formatDate(post.published_at)}</p>
          <h1 className="mt-2 text-[34px] leading-tight font-black tracking-tight md:text-[42px]">{post.title}</h1>
          {post.excerpt && <p className="mt-4 text-[18px] leading-relaxed text-ink-600">{post.excerpt}</p>}
        </header>

        {post.featured_image && (
          <img
            src={post.featured_image}
            alt={post.featured_image_alt ?? post.title}
            className="mt-8 w-full rounded-lg object-cover"
          />
        )}

        {/* Điện thoại và máy tính bảng: mục lục thu gọn ngay đầu bài */}
        {showToc && (
          <details className="mt-8 rounded-lg border border-ink-200 p-5 lg:hidden">
            <summary className="cursor-pointer text-[13px] font-bold uppercase tracking-wide text-ink-500">
              In this article
            </summary>
            <nav aria-label="Table of contents" className="mt-3">
              <ArticleToc headings={toc} />
            </nav>
          </details>
        )}

        <div
          className="blog-prose mt-10 max-w-none text-[17px] leading-[1.75] text-ink-800"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        <ArticleCta className="mt-12 lg:hidden" />

        {related.length > 0 && (
          <section className="mt-14 border-t border-ink-200 pt-8" aria-labelledby="related-heading">
            <h2 id="related-heading" className="text-[13px] font-bold uppercase tracking-wide text-ink-500">
              Related news
            </h2>
            <ul className="mt-4 divide-y divide-ink-100">
              {related.map((item) => (
                <li key={item.id} className="py-4">
                  <p className="text-[12px] font-semibold text-brand-700">{formatDate(item.published_at)}</p>
                  <Link href={`/blog/${item.slug}`} className="mt-1 block text-[17px] leading-snug font-bold hover:text-brand-700">
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-14 border-t border-ink-200 pt-6 text-[14px] text-ink-600">
          <Link href="/blog" className="font-semibold text-brand-700 hover:underline">
            ← More news
          </Link>
        </footer>
      </div>

      {/* Máy tính: sidebar dính khi cuộn, chỉ gồm mục lục và lời kêu gọi */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-6">
          {showToc && (
            <nav aria-label="Table of contents" className="rounded-lg border border-ink-200 p-5">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">In this article</p>
              <div className="mt-3 max-h-[60vh] overflow-y-auto pr-1">
                <ArticleToc headings={toc} />
              </div>
            </nav>
          )}
          <ArticleCta />
        </div>
      </aside>
    </article>
  );
}
