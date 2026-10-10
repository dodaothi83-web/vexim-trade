import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { ownerScopeOf } from "@/lib/auth/scope";
import { computeOwnerKpis, vietnamMonthRange } from "@/lib/kpi";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "KPI cá nhân" };

function pct(v: number | null) {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

export default async function TeamPage() {
  const session = await requirePagePermission("kpi.view", "/dashboard");
  const scope = ownerScopeOf(session);
  const { monthStart, monthEnd } = vietnamMonthRange();
  const store = getStore();
  const [buyers, messages] = await Promise.all([store.listBuyers(), store.listMessages(5000)]);

  const rows = computeOwnerKpis({ buyers, messages, monthStart, monthEnd, scope });
  const monthLabel = new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(monthStart.getTime() + 24 * 60 * 60 * 1000));

  return (
    <>
      <PageHeader
        title="KPI cá nhân"
        sub={`Tháng ${monthLabel} · tính theo buyer đang phụ trách · hoa hồng sẽ bổ sung khi có dữ liệu thanh toán`}
      />
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-ink-100 text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">Người phụ trách</th>
              <th className="px-4 py-3 text-right font-medium">Buyer đang phụ trách</th>
              <th className="px-4 py-3 text-right font-medium">Buyer đã liên hệ</th>
              <th className="px-4 py-3 text-right font-medium">Email đã gửi</th>
              <th className="px-4 py-3 text-right font-medium">Buyer đã phản hồi</th>
              <th className="px-4 py-3 text-right font-medium">Tỷ lệ phản hồi</th>
              <th className="px-4 py-3 text-right font-medium">Buyer đã gán NCC</th>
              <th className="px-4 py-3 font-medium">Hoa hồng</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-ink-400">
                  Chưa có dữ liệu cho phạm vi của bạn.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.owner} className="border-b border-ink-50 last:border-0">
                <td className="px-4 py-3 font-medium text-ink-800">{r.owner}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.buyers}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.buyersContacted}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.emailsSent}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.buyersReplied}
                  <span className="ml-1 text-ink-400">({r.replies} thư)</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(r.replyRate)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.buyersWithSupplier}</td>
                <td className="px-4 py-3 text-ink-400">Chưa tính</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-[12px] text-ink-400">
        Email và phản hồi tính trong tháng hiện tại (giờ Việt Nam). Buyer đã gán NCC là số buyer đang có nhà cung cấp tại thời điểm xem.
      </p>
    </>
  );
}
