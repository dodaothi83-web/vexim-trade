import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowUpRight, Eye, Package, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { readSupplierTraffic } from "@/lib/traffic/server";
import { buildTrafficReport } from "@/lib/supplier-portal/traffic-report";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lượt xem gian hàng", robots: { index: false, follow: false } };
const format = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

export default async function SupplierTrafficPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, store } = access;
  const range = (await searchParams).range;
  const days: 7 | 30 | 90 = range === "7" ? 7 : range === "90" ? 90 : 30;
  let rows = null;
  try { rows = await readSupplierTraffic(supplier.id, days); }
  catch (error) { console.error("supplier traffic dashboard unavailable", error); }
  const report = rows ? buildTrafficReport(rows, supplier.id, days) : null;
  const products = report?.products.length ? await store.listProductsBySupplier(supplier.id) : [];
  const names = new Map(products.filter((p) => p.supplier_id === supplier.id).map((p) => [p.id, withoutDirectContacts(p.name)]));
  const chunk = days === 7 ? 1 : days === 30 ? 5 : 10;
  const bars = report ? Array.from({ length: Math.ceil(days / chunk) }, (_, i) => {
    const part = report.trend.slice(i * chunk, (i + 1) * chunk);
    return { label: `${part[0].day.slice(5)} đến ${part.at(-1)!.day.slice(5)}`,
      profile: part.reduce((sum, d) => sum + d.profile, 0), product: part.reduce((sum, d) => sum + d.product, 0) };
  }) : [];
  const max = Math.max(1, ...bars.map((b) => b.profile + b.product));
  const live = supplier.status === "published" && !isSyntheticSupplier(supplier);

  return <>
    <PageHeader
      eyebrow="Cổng nhà cung cấp · riêng tư"
      title="Lượt xem gian hàng"
      sub="Theo dõi số lần buyer mở hồ sơ và trang chi tiết sản phẩm công khai của bạn."
      actions={live ? <Link href={`/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-brand-800 hover:border-brand-400">Xem hồ sơ công khai <ArrowUpRight className="size-4" /></Link> : undefined}
    />
    <nav aria-label="Khoảng thời gian" className="mb-5 inline-flex gap-1 rounded-lg border border-ink-200 bg-white p-1">
      {([7, 30, 90] as const).map((d) => <Link key={d} href={`/supplier/portal/traffic?range=${d}`}
        aria-current={days === d ? "page" : undefined}
        className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${days === d ? "bg-brand-800 text-white" : "text-ink-600 hover:bg-ink-50"}`}>{d} ngày</Link>)}
    </nav>
    {!report ? <div role="status" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
      <h2 className="font-bold">Chưa có dữ liệu theo dõi</h2>
      <p className="mt-2 text-sm leading-6">Báo cáo chưa kết nối được bảng thống kê: hệ thống cần cấu hình Supabase và áp dụng migration <code>20261017_supplier_traffic_daily.sql</code> trên đúng dự án. Không hiển thị số 0 khi chưa ghi nhận được dữ liệu.</p>
    </div> : <>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Tổng lượt xem", value: report.total, icon: Activity, color: "text-brand-700", bg: "bg-brand-50" },
          { label: "Hồ sơ nhà cung cấp", value: report.profile, icon: Eye, color: "text-sky-700", bg: "bg-sky-50" },
          { label: "Chi tiết sản phẩm", value: report.product, icon: Package, color: "text-amber-700", bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => <div key={label} className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
          <span className={`inline-flex size-10 items-center justify-center rounded-xl ${bg} ${color}`}><Icon className="size-5" aria-hidden="true" /></span>
          <p className="mt-5 text-3xl font-black tabular-nums text-ink-900">{format(value)}</p>
          <p className="mt-1 text-sm font-medium text-ink-600">{label}</p>
        </div>)}
      </div>
      {report.total === 0 ? <div role="status" className="mt-6 rounded-xl border border-ink-200 bg-white p-8 text-center sm:p-12">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Eye className="size-6" /></div>
        <h2 className="mt-4 text-lg font-bold text-ink-900">Chưa có lượt xem trong {days} ngày qua</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-600">Số liệu chỉ bắt đầu từ khi bật theo dõi. Hồ sơ và sản phẩm cần được công khai để có lượt xem được ghi nhận.</p>
      </div> : <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="traffic-trend">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="traffic-trend" className="text-lg font-bold text-ink-900">Xu hướng lượt xem</h2>
            <p className="mt-1 text-xs text-ink-500">Theo ngày UTC · mỗi cột {chunk === 1 ? "1 ngày" : `${chunk} ngày`}</p></div>
            <div className="flex gap-3 text-xs font-medium text-ink-600"><span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-brand-700" />Hồ sơ</span><span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-sky-400" />Sản phẩm</span></div>
          </div>
          <div className="mt-8 flex h-52 items-end gap-2 border-b border-ink-200 pb-1 sm:gap-3" role="img" aria-label={`Biểu đồ ${days} ngày: ${format(report.profile)} lượt hồ sơ, ${format(report.product)} lượt sản phẩm`}>
            {bars.map((bar) => <div key={bar.label} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${bar.label}: ${format(bar.profile)} hồ sơ, ${format(bar.product)} sản phẩm`}>
              <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-md bg-ink-100" style={{ height: `${Math.max(2, ((bar.profile + bar.product) / max) * 100)}%` }}>
                <div className="bg-sky-400" style={{ height: `${bar.profile + bar.product ? bar.product / (bar.profile + bar.product) * 100 : 0}%` }} />
                <div className="bg-brand-700" style={{ height: `${bar.profile + bar.product ? bar.profile / (bar.profile + bar.product) * 100 : 0}%` }} />
              </div>
            </div>)}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink-500"><span>{bars[0]?.label}</span><span>{bars.at(-1)?.label}</span></div>
          <details className="mt-5 rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-brand-800">Xem số liệu từng mốc</summary>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[280px] text-left text-xs tabular-nums text-ink-700">
              <thead><tr className="border-b border-ink-200"><th scope="col" className="py-2">Thời gian (UTC)</th><th scope="col" className="py-2 text-right">Hồ sơ</th><th scope="col" className="py-2 text-right">Sản phẩm</th></tr></thead>
              <tbody>{bars.map((bar) => <tr key={bar.label} className="border-b border-ink-100 last:border-0"><th scope="row" className="py-2 font-medium">{bar.label}</th><td className="py-2 text-right">{format(bar.profile)}</td><td className="py-2 text-right">{format(bar.product)}</td></tr>)}</tbody>
            </table></div>
          </details>
          <p className="mt-4 text-xs leading-5 text-ink-500">Lượt xem trang, không phải số người duy nhất. Cột gộp theo thời gian đã chọn.</p>
        </section>
        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="traffic-products">
          <h2 id="traffic-products" className="text-lg font-bold text-ink-900">Sản phẩm được xem nhiều</h2>
          <p className="mt-1 text-xs text-ink-500">Trong {days} ngày qua · chỉ sản phẩm của bạn</p>
          {report.products.length ? <ol className="mt-5 divide-y divide-ink-100">
            {report.products.slice(0, 5).map((item, i) => <li key={item.id} className="flex items-center gap-3 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-bold text-ink-500">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">{names.get(item.id) || "Sản phẩm đã gỡ"}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-brand-800">{format(item.views)}</span>
            </li>)}
          </ol> : <p className="mt-8 text-sm text-ink-500">Chưa có lượt xem sản phẩm. Lượt xem hồ sơ được thống kê riêng.</p>}
        </section>
      </div>}
    </>}
    <aside className="mt-6 flex items-start gap-3 rounded-xl border border-ink-200 bg-ink-50 p-5 text-sm leading-6 text-ink-600">
      <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" />
      <p><strong className="text-ink-800">Cách tính minh bạch.</strong> Chỉ ghi nhận trang hồ sơ/sản phẩm công khai được mở bằng trình duyệt; bỏ qua phiên đã đăng nhập, demo và crawler thông dụng. Cùng trang trong một tab được giới hạn một lần mỗi 30 phút. Không lưu IP, danh tính người xem hay nguồn truy cập; số liệu có thể thiếu hoặc sai lệch do chặn JavaScript, ad blocker hoặc bot và không đại diện cho buyer duy nhất. Không bao gồm lượt xem trước ngày bật theo dõi.</p>
    </aside>
  </>;
}
