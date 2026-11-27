import Link from "next/link";

import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { Button, Card, EmptyState, formatDate } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { GUIDE_TOPICS, guideTopic } from "@/lib/guides/topics";
import type { SupplierGuide } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Hướng dẫn nhà cung cấp" };

export default async function GuidesAdminPage() {
  await requirePagePermission("blog.manage");
  // Bảng chưa được tạo (chưa chạy migration) thì báo rõ thay vì làm hỏng trang.
  let guides: SupplierGuide[] = [];
  let unavailable = false;
  try { guides = await getStore().listSupplierGuides(); }
  catch (error) { unavailable = true; console.error("[supplier-guides] list", error); }
  const order = new Map(GUIDE_TOPICS.map((topic, index) => [topic.slug, index]));
  const rows = [...guides].sort((a, b) => (order.get(a.topic) ?? 99) - (order.get(b.topic) ?? 99) || a.sort_order - b.sort_order || a.title.localeCompare(b.title, "vi"));

  return (
    <div>
      <PageHeader
        title="Hướng dẫn nhà cung cấp"
        sub="Bài hướng dẫn hiện trong cổng nhà cung cấp. Không công khai, không lên blog."
        actions={<Link href="/crm/guides/new"><Button variant="primary">Viết hướng dẫn mới</Button></Link>}
      />
      {unavailable ? (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Chưa đọc được bảng hướng dẫn. Cần chạy migration supabase/migrations/20261231_supplier_guides.sql trên Supabase.
        </p>
      ) : rows.length === 0 ? (
        <EmptyState icon={null} title="Chưa có bài hướng dẫn" sub="Bấm “Viết hướng dẫn mới” để bắt đầu." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="border-b border-ink-200 text-[11px] uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Tiêu đề</th>
                <th className="px-4 py-2.5 font-semibold">Chủ đề</th>
                <th className="px-4 py-2.5 font-semibold">Thứ tự</th>
                <th className="px-4 py-2.5 font-semibold">Trạng thái</th>
                <th className="px-4 py-2.5 font-semibold">Cập nhật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((guide) => (
                <tr key={guide.id} className="hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <Link href={`/crm/guides/${guide.id}`} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline">{guide.title}</Link>
                    {guide.summary && <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-500">{guide.summary}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{guideTopic(guide.topic)?.label.vi ?? guide.topic}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-700">{guide.sort_order}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${guide.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-ink-100 text-ink-600"}`}>
                      {guide.status === "published" ? "Đã xuất bản" : "Bản nháp"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{formatDate(guide.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
