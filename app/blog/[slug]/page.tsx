import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { blocksToHTML } from "@/lib/blocks-to-html";
import { ensureHeadingAnchors } from "@/lib/blog/heading-anchors";
import { normalizeBlocksFromStorage } from "@/lib/blog/blocks-from-storage";
import { getPublishedNewsBySlug } from "@/lib/blog/queries";
import { COMPANY } from "@/lib/config";
import { SITE_URL } from "@/lib/site";

/** ISR: làm mới bài viết sau tối đa 60 giây */
export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedNewsBySlug(slug);
  if (!post) return { title: "Không tìm thấy bài viết" };

  const title = post.meta_title || post.title;
  const description = post.meta_description || post.excerpt || undefined;
  const url = `${SITE_URL}/blog/${post.slug}`;

  return {
    title,
    description,
    keywords: post.focus_keyword ? [post.focus_keyword] : undefined,
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
      { "@type": "ListItem", position: 1, name: "Trang chủ", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Tin tức", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(blogPosting) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbs) }} />

      <nav className="text-[13px] text-ink-500">
        <Link href="/blog" className="hover:text-ink-900">Tin tức</Link>
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

      {headings.length > 1 && (
        <nav aria-label="Mục lục" className="mt-8 rounded-lg border border-ink-200 p-5">
          <p className="text-[12px] font-bold uppercase tracking-wide text-ink-500">Trong bài này</p>
          <ul className="mt-3 space-y-1.5 text-[14px]">
            {headings.map((h) => (
              <li key={h.id} style={{ paddingLeft: `${Math.max(0, h.level - 2) * 12}px` }}>
                <a href={`#${h.id}`} className="text-ink-700 hover:text-brand-700">
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div
        className="blog-prose mt-10 max-w-none text-[17px] leading-[1.75] text-ink-800"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <footer className="mt-14 border-t border-ink-200 pt-6 text-[14px] text-ink-600">
        <Link href="/blog" className="font-semibold text-brand-700 hover:underline">
          ← Xem các tin tức khác
        </Link>
      </footer>
    </article>
  );
}
