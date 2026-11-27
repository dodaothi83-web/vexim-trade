import Link from "next/link";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { BLOG_CATEGORIES, blogPostPath, getBlogCategory } from "@/lib/blog/blog-categories";
import { Button, Card, EmptyState, formatDate } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { VIEW_BUTTON_CLASS, VIEW_BUTTON_DISABLED_CLASS } from "@/lib/blog/view-button";

export const dynamic = "force-dynamic";

export const metadata = { title: "Blog" };

export default async function BlogAdminPage() {
  await requirePagePermission("blog.manage");

  // Mọi mục blog: News (tiếng Anh, cho người mua) và Kiến thức xuất khẩu (tiếng Việt, cho doanh nghiệp Việt).
  const known = new Set(BLOG_CATEGORIES.map((c) => c.slug));
  const posts = (await getStore().listPosts()).filter((p) => known.has(p.category));

  return (
    <div>
      <PageHeader
        title="Blog"
        sub="News (tiếng Anh, veximtrade.com/blog) và Kiến thức xuất khẩu (tiếng Việt, veximtrade.com/blog/xuat-khau)"
        actions={
          <Link href="/crm/posts/new">
            <Button variant="primary">Viết bài mới</Button>
          </Link>
        }
      />

      {posts.length === 0 ? (
        <EmptyState icon={null} title="Chưa có bài viết" sub="Bấm “Viết bài mới” để bắt đầu." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-ink-200 text-[11px] uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Ảnh</th>
                <th className="px-4 py-2.5 font-semibold">Tiêu đề</th>
                <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold">Xuất bản</th>
                <th className="px-4 py-2.5 font-semibold">Cập nhật</th>
                <th className="px-4 py-2.5 text-right font-semibold">Xem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-ink-50">
                  <td className="px-4 py-3">
                    {post.featured_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.featured_image}
                        alt=""
                        loading="lazy"
                        className="h-10 w-16 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-16 items-center justify-center rounded bg-ink-100 text-[10px] text-ink-400">
                        Không ảnh
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/crm/posts/${post.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                      {post.title}
                    </Link>
                    <div className="text-[12px] text-ink-400">
                      <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${getBlogCategory(post.category)?.lang === "vi" ? "bg-amber-50 text-amber-800" : "bg-ink-100 text-ink-600"}`}>
                        {getBlogCategory(post.category)?.lang === "vi" ? "Tiếng Việt" : "News"}
                      </span>
                      {blogPostPath(post)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {post.status === "published" ? (
                      <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[12px] font-semibold text-brand-700">Đã xuất bản</span>
                    ) : (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[12px] font-semibold text-ink-600">Bản nháp</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600">{formatDate(post.published_at)}</td>
                  <td className="px-4 py-3 text-ink-600">{formatDate(post.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {post.status === "published" ? (
                      <a href={blogPostPath(post)} target="_blank" rel="noopener noreferrer" className={VIEW_BUTTON_CLASS}>
                        Xem
                      </a>
                    ) : (
                      <span title="Xuất bản bài để xem trên trang công khai" className={VIEW_BUTTON_DISABLED_CLASS}>
                        Xem
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
