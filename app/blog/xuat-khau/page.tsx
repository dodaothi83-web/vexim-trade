import type { Metadata } from "next";
import Link from "next/link";

import { listPublishedViExport } from "@/lib/blog/queries";
import { getBlogCategory, VI_EXPORT_BLOG_CATEGORY } from "@/lib/blog/blog-categories";
import { SupplierCta } from "@/components/blog/supplier-cta";
import { pageTitle, SITE_NAME, SITE_URL } from "@/lib/site";

/** ISR: làm mới danh sách sau tối đa 60 giây (lưu bài trong CRM xoá cache ngay). */
export const revalidate = 60;

const category = getBlogCategory(VI_EXPORT_BLOG_CATEGORY)!;
const url = `${SITE_URL}${category.basePath}`;

/**
 * Mục Kiến thức xuất khẩu: bài tiếng Việt cho doanh nghiệp Việt Nam (SEO thu hút nhà cung cấp).
 * Viết riêng cho người đọc Việt, không phải bản dịch của mục News, nên không khai hreflang ghép cặp.
 */
export const metadata: Metadata = {
  title: pageTitle(category.title),
  description: category.description,
  alternates: { canonical: url },
  openGraph: { title: category.title, description: category.description, url, siteName: SITE_NAME, type: "website", locale: "vi_VN" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("vi-VN", { year: "numeric", month: "long", day: "numeric" });
}

export default async function ViExportIndexPage() {
  const posts = await listPublishedViExport();
  return (
    <section lang="vi" className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <h1 className="text-[34px] leading-tight font-black tracking-tight">{category.title}</h1>
        <p className="mt-2 max-w-2xl text-[16px] text-ink-600">{category.description}</p>
        {posts.length === 0 ? (
          <p className="mt-10 text-ink-500">Chưa có bài viết.</p>
        ) : (
          <ul className="mt-10 divide-y divide-ink-200">
            {posts.map((post) => (
              <li key={post.id} className="py-6">
                <p className="text-[13px] font-semibold text-brand-700">{formatDate(post.published_at)}</p>
                <h2 className="mt-1 text-[22px] leading-snug font-bold">
                  <Link href={`${category.basePath}/${post.slug}`} className="hover:text-brand-700">{post.title}</Link>
                </h2>
                {post.excerpt && <p className="mt-2 text-[15px] text-ink-600">{post.excerpt}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <aside className="hidden lg:block"><div className="sticky top-24"><SupplierCta /></div></aside>
      <SupplierCta className="lg:hidden" />
    </section>
  );
}
