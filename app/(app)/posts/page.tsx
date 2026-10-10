import Link from "next/link";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { DEFAULT_BLOG_CATEGORY } from "@/lib/blog/blog-categories";
import { Button, Card, EmptyState, formatDate } from "@/components/ui";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export const metadata = { title: "Blog" };

export default async function BlogAdminPage() {
  await requirePagePermission("blog.manage");

  const posts = (await getStore().listPosts()).filter((p) => p.category === DEFAULT_BLOG_CATEGORY);

  return (
    <div>
      <PageHeader
        title="Blog"
        sub="Bài viết mục Tin tức hiển thị tại veximtrade.com/blog"
        actions={
          <Link href="/posts/new">
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
                <th className="px-4 py-2.5 font-semibold">Tiêu đề</th>
                <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold">Xuất bản</th>
                <th className="px-4 py-2.5 font-semibold">Cập nhật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <Link href={`/posts/${post.id}`} className="font-semibold text-ink-900 hover:text-brand-700">
                      {post.title}
                    </Link>
                    <div className="text-[12px] text-ink-400">/blog/{post.slug}</div>
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
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
