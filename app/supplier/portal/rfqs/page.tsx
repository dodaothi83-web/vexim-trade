import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, PackageSearch, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { buildSupplierRfqBoard } from "@/lib/supplier-portal/dashboard";
import { supplierReplyAddress } from "@/lib/rfq/reply-routing";
import { migrationHint } from "@/lib/db/migration-hints";
import { EmptyRow, Panel, date } from "../portal-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "RFQ & báo giá", robots: { index: false, follow: false } };

/**
 * Một trang cho toàn bộ công việc RFQ: việc cần trả lời, danh sách đã chuyển và báo cáo.
 * Trang tổng quan chỉ hiện số đếm rồi dẫn sang đây.
 */
export default async function SupplierRfqPage({ searchParams }: { searchParams: Promise<{ range?: string; all?: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier, store } = access;

  const degraded: string[] = [];
  async function optional<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (error) {
      console.error(`[supplier-portal] chưa đọc được ${label}. ${migrationHint(error) ?? ""}`.trim(), error);
      degraded.push(label);
      return fallback;
    }
  }
  const [invites, products] = await Promise.all([
    optional("danh sách RFQ được chuyển", [] as Awaited<ReturnType<typeof store.listSupplierRfqInvitations>>,
      () => store.listSupplierRfqInvitations(supplier.id)),
    optional("sản phẩm", [] as Awaited<ReturnType<typeof store.listProductsBySupplier>>,
      () => store.listProductsBySupplier(supplier.id)),
  ]);

  const sp = await searchParams;
  const days: 7 | 30 | 90 = sp.range === "7" ? 7 : sp.range === "90" ? 90 : 30;
  const showAll = sp.all === "1";
  const board = buildSupplierRfqBoard({ supplierId: supplier.id, invites, products, days });
  const shown = showAll ? board.invites : board.invites.slice(0, 30);

  return <>
    <PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title="RFQ & báo giá"
      sub="Chỉ những yêu cầu báo giá đã được chuyển tới doanh nghiệp. Thông tin buyer được giữ kín."
      actions={<>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-900">{board.tasks.length} cần phản hồi</span>
        <span className="rounded-full bg-ink-100 px-3 py-1 text-[11px] font-bold text-ink-700">{board.invites.length} lời mời</span>
      </>} />

    {degraded.length > 0 && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-bold">Một phần dữ liệu RFQ chưa tải được</p>
      <p className="mt-1">Phần còn lại vẫn dùng bình thường. Nếu tình trạng này kéo dài, liên hệ bộ phận hỗ trợ để kiểm tra cấu hình.</p>
      <ul className="mt-2 list-inside list-disc text-xs">{degraded.map((label) => <li key={label}>{label}</li>)}</ul>
    </div>}

    <div className="space-y-5">
      <Panel icon={<Mail className="h-4 w-4 text-brand-700" />} title="Cần bạn phản hồi" count={board.tasks.length}
        sub="Trả lời thư mời chào giá trong hộp thư của bạn. Không liên hệ buyer trực tiếp." flush>
        {board.tasks.length ? <ul className="divide-y divide-ink-100">
          {board.tasks.map((task) => {
            const overdue = !!task.dueAt && Date.parse(task.dueAt) < Date.now();
            return <li key={task.matchId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>
                <Mail className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">{task.title}</span>
                <span className="mt-0.5 block text-xs text-ink-500">{task.code} · {task.quantity} · {task.destination}</span>
                <span className={`mt-0.5 block text-xs ${overdue ? "font-semibold text-rose-700" : "text-ink-500"}`}>
                  {overdue ? "Đã quá hạn phản hồi: " : "Hạn phản hồi: "}{task.dueAt ? date(task.dueAt) : "theo thư mời đã gửi"}
                </span>
              </span>
              <a href={`mailto:${supplierReplyAddress(task.code, task.matchId)}?subject=${encodeURIComponent(`Phản hồi ${task.code}`)}`} className="btn btn-ghost btn-sm">Trả lời qua email</a>
            </li>;
          })}</ul> : <EmptyRow>Không có RFQ nào đang chờ phản hồi.</EmptyRow>}
      </Panel>

      <Panel icon={<PackageSearch className="h-4 w-4 text-brand-700" />} title="Lời mời đã chuyển" count={board.invites.length}
        sub="Mới nhất ở trên. Mỗi dòng là một lần yêu cầu báo giá được chuyển tới, không phải đơn hàng."
        action={board.invites.length > 30 && !showAll ? <Link href="/supplier/portal/rfqs?all=1" className="text-xs font-bold text-brand-700 hover:underline">Xem tất cả</Link> : undefined} flush>
        {board.invites.length ? <ul className="divide-y divide-ink-100">
          {shown.map((item) => <li key={item.matchId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-900">{item.title}</span>
              <span className="mt-0.5 block text-xs text-ink-500">{item.code} · {item.quantity} · {item.destination} · chuyển ngày {date(item.sentAt)}</span>
              <span className="mt-0.5 block text-xs text-ink-500">Hạn phản hồi: {item.dueAt ? date(item.dueAt) : "theo thư mời đã gửi"}{item.quotePrice ? ` · Giá đã ghi nhận: ${item.quotePrice}` : ""}</span>
              {item.repliedAt && <span className="mt-0.5 block text-xs font-semibold text-emerald-700">Đã ghi nhận phản hồi ngày {date(item.repliedAt)}; nội dung sẽ được xử lý tiếp.</span>}
            </span>
            <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800">{item.status}</span>
          </li>)}</ul> : <EmptyRow>Chưa có RFQ nào được chuyển tới doanh nghiệp.</EmptyRow>}
      </Panel>

      <Panel icon={<TrendingUp className="h-4 w-4 text-brand-700" />} title="Báo cáo lời mời báo giá"
        sub="Chỉ tính RFQ thực sự chuyển tới doanh nghiệp, không tính lượt xem hay doanh thu."
        flush
        action={<nav aria-label="Khoảng thời gian báo cáo" className="flex gap-1 rounded-lg border border-ink-200 bg-ink-50 p-1">
          {([7, 30, 90] as const).map((d) => <Link key={d} href={`/supplier/portal/rfqs?range=${d}`} aria-current={days === d ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${days === d ? "bg-white text-brand-800 shadow-sm" : "text-ink-500 hover:text-ink-800"}`}>{d} ngày</Link>)}
        </nav>}>
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {([["Được chuyển", board.report.sent], ["Đã phản hồi", board.report.responded],
            ["Đã ghi báo giá", board.report.quoted], ["Được chọn", board.report.selected]] as const).map(([label, value]) =>
            <div key={label} className="rounded-lg bg-ink-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-ink-600">{label}</p>
              <p className="mt-1 text-2xl leading-none font-black tabular-nums text-ink-900">{value}</p>
            </div>)}
        </div>
        {board.report.byProduct.length ? <div className="overflow-x-auto border-t border-ink-200">
          <table className="w-full min-w-[380px] text-left text-sm">
            <thead className="bg-ink-50 text-[11px] font-semibold text-ink-600"><tr><th scope="col" className="px-5 py-2">Sản phẩm nguồn</th><th scope="col" className="px-3 py-2 text-right">Lời mời</th><th scope="col" className="px-5 py-2 text-right">Có báo giá</th></tr></thead>
            <tbody className="divide-y divide-ink-100">{board.report.byProduct.map((row) => <tr key={row.id}>
              <td className="px-5 py-2.5 text-ink-800">{row.name}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-ink-700">{row.sent}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-ink-700">{row.quoted}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyRow>Chưa có lời mời trong {days} ngày qua.</EmptyRow>}
        <p className="border-t border-ink-200 px-5 py-2.5 text-[11px] leading-4 text-ink-500">RFQ chung hoặc RFQ không có liên kết sản phẩm xác thực được nhóm riêng; không suy đoán từ tên sản phẩm buyer tự nhập.</p>
      </Panel>
    </div>
  </>;
}
