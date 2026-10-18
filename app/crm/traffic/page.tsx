import Link from "next/link";
import { Activity, FileQuestion, Package, Store } from "lucide-react";

import { requirePagePermission } from "@/lib/auth/session";
import { readSiteTraffic } from "@/lib/traffic/site";
import { buildSiteTrafficReport } from "@/lib/traffic/site-report";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lưu lượng truy cập | Vexim Trade", robots: { index: false, follow: false } };
const format = (value: number) => value.toLocaleString("vi-VN");

export default async function TrafficPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requirePagePermission("traffic.view", "/crm/dashboard");
  const range = (await searchParams).range;
  const days: 7 | 30 | 90 = range === "7" ? 7 : range === "90" ? 90 : 30;
  let rows = null;
  try { rows = await readSiteTraffic(days); }
  catch (error) { console.error("[crm/traffic] report unavailable", error); }
  const report = rows ? buildSiteTrafficReport(rows, days) : null;
  const max = Math.max(1, ...(report?.trend.map((row) => row.views) ?? []));
  const highest = report?.breakdown.reduce((a, b) => a.views > b.views ? a : b);

  return <>
    <PageHeader title="Lưu lượng truy cập" sub="Báo cáo lượt mở các trang công khai của Vexim; chỉ quản trị viên xem được. Không phải số người duy nhất, đơn hàng hay doanh thu." />
    <nav aria-label="Khoảng thời gian" className="mb-5 inline-flex gap-1 rounded-xl border border-ink-200 bg-white p-1">
      {([7, 30, 90] as const).map((d) => <Link key={d} href={`/crm/traffic?range=${d}`}
        aria-current={days === d ? "page" : undefined}
        className={`rounded-lg px-4 py-2 text-sm font-semibold ${days === d ? "bg-brand-800 text-white" : "text-ink-600 hover:bg-ink-50"}`}>{d} ngày</Link>)}
    </nav>
    {!report ? <Card className="border-amber-200 bg-amber-50 p-6" >
      <h2 className="font-bold text-amber-950">Chưa đọc được thống kê</h2>
      <p className="mt-2 text-sm leading-6 text-amber-900">Cần kết nối Supabase bằng service role và áp dụng migration <code>20261017_supplier_traffic_daily.sql</code>, sau đó <code>20261018_vexim_site_traffic.sql</code> trên đúng dự án. Không hiển thị số 0 khi báo cáo chưa hoạt động.</p>
    </Card> : <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tổng lượt xem" value={report.total} icon={<Activity className="h-5 w-5" />} />
        <Stat label="Hồ sơ NCC" value={report.breakdown[2].views} icon={<Store className="h-5 w-5" />} />
        <Stat label="Chi tiết sản phẩm" value={report.breakdown[3].views} icon={<Package className="h-5 w-5" />} />
        <Stat label="Trang RFQ" value={report.breakdown[4].views} icon={<FileQuestion className="h-5 w-5" />} />
      </div>
      {report.total === 0 && <Card className="mt-5 p-5 text-sm text-ink-600">Chưa ghi nhận lượt xem trong {days} ngày. Bộ đếm không thể truy hồi lượt xem trước khi bật theo dõi.</Card>}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-bold text-ink-900">Xu hướng lượt xem · {days} ngày</h2>
          <p className="mt-1 text-xs text-ink-500">Theo ngày UTC; mỗi cột là một ngày. Bấm “Xem từng ngày” để đọc số chính xác.</p>
          <div className="mt-8 flex h-48 items-end gap-px border-b border-ink-200" role="img" aria-label={`Biểu đồ ${days} ngày, tổng ${format(report.total)} lượt xem`}>
            {report.trend.map((row) => <div key={row.day} title={`${row.day}: ${format(row.views)} lượt`}
              className="min-w-0 flex-1 rounded-t bg-brand-600 hover:bg-brand-800"
              style={{ height: `${Math.max(2, row.views / max * 100)}%` }} />)}
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-500"><span>{report.trend[0]?.day}</span><span>{report.trend.at(-1)?.day}</span></div>
          <details className="mt-5 rounded-lg border border-ink-100 bg-ink-50 p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-brand-800">Xem từng ngày</summary>
            <div className="mt-3 max-h-60 overflow-y-auto"><table className="w-full text-sm tabular-nums"><thead><tr className="text-left text-ink-500"><th scope="col" className="py-2">Ngày UTC</th><th scope="col" className="text-right">Lượt xem</th></tr></thead>
              <tbody>{report.trend.map((row) => <tr key={row.day} className="border-t border-ink-100"><td className="py-1.5">{row.day}</td><td className="text-right">{format(row.views)}</td></tr>)}</tbody></table></div>
          </details>
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-bold text-ink-900">Theo khu vực trang</h2>
          <p className="mt-1 text-xs text-ink-500">{highest?.views ? `Nhiều nhất: ${highest.label}` : "Chưa có lượt xem"}</p>
          <ul className="mt-5 space-y-3">{report.breakdown.map((item) => <li key={item.key} className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2 text-sm">
            <span className="text-ink-700">{item.label}</span><strong className="tabular-nums text-ink-900">{format(item.views)}</strong>
          </li>)}</ul>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <TopList title="Danh mục được mở nhiều" rows={report.topCategories} />
        <TopList title="Bài viết được mở nhiều" rows={report.topArticles} />
      </div>
      <Card className="mt-5 p-5 text-xs leading-6 text-ink-600">
        <strong className="text-ink-900">Cách tính:</strong> Chỉ tính lượt mở trang từ trình duyệt có JavaScript, tối đa một lượt cho cùng trang trong một tab mỗi 30 phút; loại trừ phiên đăng nhập và bot thông dụng. Không lưu IP, nguồn truy cập, thông tin buyer hoặc URL chứa tham số. Hồ sơ NCC và chi tiết sản phẩm được tổng hợp từ bộ đếm NCC hiện có, không cộng lặp. Số liệu có thể thiếu do chặn JavaScript và không phải khách truy cập duy nhất. <Link href="/crm/rfqs" className="font-semibold text-brand-700 hover:underline">RFQ</Link> là yêu cầu báo giá riêng, không suy ra tỷ lệ chuyển đổi từ các số này.
      </Card>
    </>}
  </>;
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <Card className="p-4"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
    <strong className="mt-3 block text-3xl tabular-nums text-ink-900">{format(value)}</strong><span className="mt-1 block text-sm text-ink-600">{label}</span></Card>;
}
function TopList({ title, rows }: { title: string; rows: { slug: string; views: number }[] }) {
  return <Card className="p-5"><h2 className="text-base font-bold text-ink-900">{title}</h2>
    {rows.length ? <ol className="mt-4 space-y-2">{rows.map((row, i) => <li key={row.slug} className="flex items-center gap-3 border-b border-ink-100 pb-2 text-sm">
      <span className="w-6 text-ink-400">{i + 1}.</span><span className="min-w-0 flex-1 truncate text-ink-700">{row.slug}</span><strong className="tabular-nums">{format(row.views)}</strong>
    </li>)}</ol> : <p className="mt-4 text-sm text-ink-500">Chưa có dữ liệu trong khoảng thời gian này.</p>}
  </Card>;
}
