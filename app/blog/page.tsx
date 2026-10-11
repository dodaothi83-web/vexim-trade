import type { Metadata } from "next";
import Link from "next/link";

import { listPublishedNews } from "@/lib/blog/queries";
import { DEFAULT_BLOG_CATEGORY, getBlogCategory } from "@/lib/blog/blog-categories";
import { SITE_URL } from "@/lib/site";

/** ISR: làm mới danh sách sau tối đa 60 giây */
export const revalidate = 60;

const category = getBlogCategory(DEFAULT_BLOG_CATEGORY);

export const metadata: Metadata = {
  title: { absolute: "News | Veximtrade" },
  description: category?.description,
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: category?.title,
    description: category?.description,
    url: `${SITE_URL}/blog`,
    siteName: "Veximtrade",
    type: "website",
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogIndexPage() {
  const posts = await listPublishedNews();

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-[36px] leading-tight font-black tracking-tight">News</h1>
      <p className="mt-2 max-w-2xl text-[16px] text-ink-600">{category?.description}</p>

      {posts.length === 0 ? (
        <p className="mt-10 text-ink-500">No articles yet.</p>
      ) : (
        <ul className="mt-10 divide-y divide-ink-200">
          {posts.map((post) => (
            <li key={post.id} className="py-6">
              <p className="text-[13px] font-semibold text-brand-700">{formatDate(post.published_at)}</p>
              <h2 className="mt-1 text-[22px] leading-snug font-bold">
                <Link href={`/blog/${post.slug}`} className="hover:text-brand-700">
                  {post.title}
                </Link>
              </h2>
              {post.excerpt && <p className="mt-2 text-[15px] text-ink-600">{post.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
