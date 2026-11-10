import Link from "next/link";
import { Inbox } from "lucide-react";

import { Breadcrumbs, Badge, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { assigneeLabel } from "@/lib/rfq/assignees";
import { rfqChannel } from "@/lib/rfq/channel";
import type { AppUser, Buyer, Rfq } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; dotClass: string }> = {
  new: { label: "Chưa xác nhận chuyển yêu cầu", dotClass: "bg-slate-400" },
  needs_review: { label: "Cần kiểm tra (lịch sử)", dotClass: "bg-rose-500" },
  in_progress: { label: "Đang xử lý (lịch sử)", dotClass: "bg-sky-500" },
  matching: { label: "Đã chuyển tới nhà cung cấp", dotClass: "bg-amber-500" },
  quoted: { label: "Đã ghi báo giá", dotClass: "bg-amber-600" },
  sampling: { label: "Đang gửi mẫu", dotClass: "bg-violet-500" },
  won: { label: "Thành công", dotClass: "bg-emerald-500" },
  lost: { label: "Thất bại", dotClass: "bg-ink-400" },
  spam: { label: "Cách ly", dotClass: "bg-red-500" },
};

const CLOSED: Array<Rfq["status"]> = ["won", "lost", "spam"];

/** Tab theo bước công việc thay vì một tab cho mỗi trạng thái. */
const VIEWS: { key: string; label: string; match: (r: Rfq) => boolean }[] = [
  { key: "all", label: "Tất cả", match: () => true },
  { key: "open", label: "RFQ đang mở", match: (r) => !isSupplierQuestion(r) && !CLOSED.includes(r.status) },
  { key: "question", label: "Câu hỏi cũ · lịch sử", match: (r) => isSupplierQuestion(r) },
  { key: "closed", label: "Đã đóng", match: (r) => !isSupplierQuestion(r) && (r.status === "won" || r.status === "lost") },
  { key: "spam", label: "Cách ly", match: (r) => !isSupplierQuestion(r) && r.status === "spam" },
];

function isSupplierQuestion(rfq: Rfq) {
  return rfqChannel(rfq) === "question";
}

function matchesStatusTab(rfq: Rfq, tab: string) {
  const view = VIEWS.find((v) => v.key === tab);
  if (view) return view.match(rfq);
  // Liên kết cũ dạng ?status=<trạng thái> vẫn lọc đúng một trạng thái.
  return !isSupplierQuestion(rfq) && rfq.status === tab;
}

function statusMeta(s: string, question = false) {
  if (question && s === "matching") return { label: "Đã gửi (lịch sử)", dotClass: "bg-slate-400" };
  if (question && s === "spam") return { label: "Cách ly (lịch sử)", dotClass: "bg-slate-400" };
  if (question) return { label: "Chưa xác nhận giao (lịch sử)", dotClass: "bg-slate-400" };
  return STATUS_LABEL[s] ?? { label: s, dotClass: "bg-ink-400" };
}

function received(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "vừa nhận";
  if (hours < 24) return `${Math.floor(hours)} giờ trước`;
  if (hours < 24 * 7) return `${Math.floor(hours / 24)} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

export default async function RfqsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  await requirePagePermission("rfq.view", "/crm/dashboard");
  const sp = await searchParams;
  const statusFilter = sp?.status ?? "all";

  const store = getStore();
  const [allRfqs, users, buyers] = await Promise.all([
    store.listRfqs(),
    store.listUsers().catch(() => [] as AppUser[]),
    store.listBuyers().catch(() => [] as Buyer[]),
  ]);
  // RFQ chung (không chọn nhà cung cấp) cần Vexim ghép: nằm ở hộp thư Tìm nguồn.
  const rfqs = allRfqs.filter((r) => rfqChannel(r) !== "sourcing");
  const sourcingCount = allRfqs.length - rfqs.length;
  const buyerMap = new Map(buyers.map((b) => [b.id, b]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const filtered = rfqs.filter((r) => matchesStatusTab(r, statusFilter));
  const extraFilter = !VIEWS.some((v) => v.key === statusFilter)
    ? STATUS_LABEL[statusFilter]?.label ?? "Không rõ bộ lọc"
    : null;

  return (
    <div className="min-w-0">
      <Breadcrumbs items={[
        { label: "Tổng quan", href: "/crm/dashboard" },
        { label: "RFQ" },
      ]} />
      <PageHeader
        title="RFQ trực tiếp"
        sub="RFQ đích danh tới nhà cung cấp đã có cổng. CRM chỉ xem để hỗ trợ; câu hỏi cũ được giữ làm lịch sử."
      />
      {sourcingCount > 0 && (
        <p className="mt-2 text-[12.5px] text-ink-600">
          {sourcingCount} yêu cầu không chọn nhà cung cấp nằm ở{" "}
          <Link href="/crm/sourcing" className="font-semibold text-brand-700 hover:underline">Tìm nguồn</Link>, nơi Vexim ghép nhà cung cấp.
        </p>
      )}

      <nav aria-label="Lọc RFQ" className="mt-4 flex gap-1 overflow-x-auto border-b border-ink-200">
        {VIEWS.map((t) => {
          const n = rfqs.filter(t.match).length;
          const active = statusFilter === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "all" ? "/crm/rfqs" : `/crm/rfqs?status=${t.key}`}
              aria-current={active ? "page" : undefined}
              className={
                "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold transition " +
                (active ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800")
              }
            >
              {t.label}
              <span className="rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-500">{n}</span>
            </Link>
          );
        })}
      </nav>
      {extraFilter && (
        <p className="mt-3 text-[12.5px] text-ink-600">
          Đang lọc: <strong>{extraFilter}</strong> ({filtered.length}) · <Link href="/crm/rfqs" className="text-brand-700 hover:underline">Bỏ lọc</Link>
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Không có yêu cầu nào"
          sub="RFQ đích danh từ nhà cung cấp được chọn hiện ở đây. RFQ chung nằm trong Tìm nguồn."
        />
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11.5px] uppercase tracking-wider text-ink-500">
                <th scope="col" className="px-4 py-2">Yêu cầu</th>
                <th scope="col" className="px-3 py-2">Người mua</th>
                <th scope="col" className="px-3 py-2">Phụ trách</th>
                <th scope="col" className="px-3 py-2">Tình trạng</th>
                <th scope="col" className="px-4 py-2 text-right">Nhận</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((r) => {
                const buyer = buyerMap.get(r.buyer_id);
                const question = isSupplierQuestion(r);
                const meta = statusMeta(r.status, question);
                const assigned = r.assigned_to ? userMap.get(r.assigned_to) : null;
                const detail = [r.quantity && r.unit ? `${r.quantity} ${r.unit}` : null, r.destination_country].filter(Boolean).join(" · ");
                return (
                  <tr key={r.id} className="align-top transition hover:bg-ink-50/60">
                    <td className="max-w-[340px] px-4 py-2.5">
                      <Link href={`/crm/rfqs/${r.id}`} className="block truncate text-[13.5px] font-semibold text-ink-900 hover:text-brand-700">
                        {r.product_text || r.code}
                      </Link>
                      <div className="mt-0.5 truncate text-[11.5px] text-ink-500">
                        <span className="font-mono">{r.code}</span>
                        {question && <span className="text-teal-700"> · câu hỏi cũ · chỉ xem</span>}
                        {rfqChannel(r) === "direct" && <span className="text-teal-700"> · chỉ xem</span>}
                        {detail && ` · ${detail}`}
                      </div>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <div className="truncate text-[13px] text-ink-900">{buyer?.company ?? "—"}</div>
                      {buyer?.country && <div className="truncate text-[11.5px] text-ink-500">{buyer.country}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12.5px] text-ink-700">{assigned ? assigneeLabel(assigned) : question ? "— (lịch sử)" : "— (chỉ xem)"}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className="inline-flex items-center gap-1">
                        <span className={"h-1.5 w-1.5 rounded-full " + meta.dotClass} />
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-[12px] text-ink-500" title={new Date(r.created_at).toLocaleString("vi-VN")}>
                      {received(r.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
