import Link from "next/link";
import { AlertTriangle, Clock, Inbox, MailCheck, Timer, UserX } from "lucide-react";

import { Breadcrumbs, Badge, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { RfqAssignmentSelect } from "./assignment-select";
import { assigneeLabel, rfqAssigneeOptions } from "@/lib/rfq/assignees";
import { rfqChannel } from "@/lib/rfq/channel";
import type { AppUser, Buyer, Rfq } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; dotClass: string }> = {
  new: { label: "Mới", dotClass: "bg-slate-400" },
  needs_review: { label: "Cần duyệt", dotClass: "bg-rose-500" },
  in_progress: { label: "Đang xử lý", dotClass: "bg-sky-500" },
  matching: { label: "Đang ghép nhà cung cấp", dotClass: "bg-amber-500" },
  quoted: { label: "Đã trình người mua", dotClass: "bg-amber-600" },
  sampling: { label: "Đang gửi mẫu", dotClass: "bg-violet-500" },
  won: { label: "Thành công", dotClass: "bg-emerald-500" },
  lost: { label: "Thất bại", dotClass: "bg-ink-400" },
  spam: { label: "Cách ly", dotClass: "bg-red-500" },
};

const CLOSED: Array<Rfq["status"]> = ["won", "lost", "spam"];

/** Tab theo bước công việc thay vì một tab cho mỗi trạng thái. */
const VIEWS: { key: string; label: string; match: (r: Rfq) => boolean }[] = [
  { key: "open", label: "Đang mở", match: (r) => !isSupplierQuestion(r) && !CLOSED.includes(r.status) },
  { key: "todo", label: "Cần xử lý", match: (r) => !isSupplierQuestion(r) && ["new", "needs_review", "in_progress"].includes(r.status) },
  { key: "matching", label: "Đang ghép nhà cung cấp", match: (r) => !isSupplierQuestion(r) && r.status === "matching" },
  { key: "buyer", label: "Chờ người mua", match: (r) => !isSupplierQuestion(r) && ["quoted", "sampling"].includes(r.status) },
  { key: "question", label: "Câu hỏi nhà cung cấp", match: (r) => isSupplierQuestion(r) },
  { key: "closed", label: "Đã đóng", match: (r) => !isSupplierQuestion(r) && (r.status === "won" || r.status === "lost") },
  { key: "spam", label: "Cách ly", match: (r) => r.status === "spam" },
  { key: "all", label: "Tất cả", match: () => true },
];

/** Bộ lọc phụ, mở từ các ô cảnh báo ở đầu trang. */
const ALERT_VIEWS: Record<string, { label: string; chip: string; match: (r: Rfq) => boolean }> = {
  unassigned: { label: "Chưa phân công", chip: "chưa phân công", match: (r) => !isSupplierQuestion(r) && !CLOSED.includes(r.status) && !r.assigned_to },
  late: { label: "Trễ hoặc sắp trễ SLA", chip: "trễ hoặc sắp trễ SLA", match: (r) => slaInfo(r)?.urgent === true },
};

function isSupplierQuestion(rfq: Rfq) {
  return rfq.source_page === "/rfq?intent=question" || rfq.specs?.inquiry_kind === "supplier_question";
}

function matchesStatusTab(rfq: Rfq, tab: string) {
  const view = VIEWS.find((v) => v.key === tab) ?? ALERT_VIEWS[tab];
  if (view) return view.match(rfq);
  // Liên kết cũ dạng ?status=<trạng thái> vẫn lọc đúng một trạng thái.
  return !isSupplierQuestion(rfq) && rfq.status === tab;
}

function statusMeta(s: string, question = false) {
  if (question && s === "matching") return { label: "Đã gửi câu hỏi", dotClass: "bg-emerald-500" };
  if (question && s === "new") return { label: "Chờ giao câu hỏi", dotClass: "bg-amber-500" };
  if (question && s === "needs_review") return { label: "Cần duyệt câu hỏi", dotClass: "bg-rose-500" };
  return STATUS_LABEL[s] ?? { label: s, dotClass: "bg-ink-400" };
}

const SLA_ASSIGN_HOURS = 4;     // phân công trong vòng 4 giờ làm việc
const SLA_RESPONSE_HOURS = 24;  // phản hồi người mua trong vòng 24 giờ làm việc

/** Gợi ý SLA chỉ cho RFQ còn mở; RFQ đã đóng không cần dòng này. */
function slaInfo(rfq: Rfq): { label: string; tone: string; icon: React.ReactNode; urgent: boolean } | null {
  if (CLOSED.includes(rfq.status)) return null;
  const ageHours = (Date.now() - new Date(rfq.created_at).getTime()) / 3_600_000;
  const red = "text-red-700", amber = "text-amber-700", green = "text-emerald-700";
  if (isSupplierQuestion(rfq)) {
    if (rfq.status === "matching") return { label: "đã gửi trực tiếp", tone: green, icon: <MailCheck className="h-3.5 w-3.5" />, urgent: false };
    if (rfq.status === "needs_review") return { label: "chờ duyệt câu hỏi", tone: amber, icon: <Clock className="h-3.5 w-3.5" />, urgent: false };
    return { label: "chờ hỗ trợ giao", tone: amber, icon: <Clock className="h-3.5 w-3.5" />, urgent: false };
  }
  if (!rfq.assigned_to && ["new", "needs_review"].includes(rfq.status) && ageHours >= SLA_ASSIGN_HOURS)
    return { label: `chưa phân công ${SLA_ASSIGN_HOURS}h+`, tone: red, icon: <Timer className="h-3.5 w-3.5" />, urgent: true };
  if (rfq.first_response_at) return { label: "đã hồi đáp", tone: green, icon: <MailCheck className="h-3.5 w-3.5" />, urgent: false };
  if (ageHours >= SLA_RESPONSE_HOURS) return { label: "quá hạn hồi đáp", tone: red, icon: <AlertTriangle className="h-3.5 w-3.5" />, urgent: true };
  if (ageHours >= SLA_RESPONSE_HOURS - 4) return { label: "sắp trễ hồi đáp", tone: amber, icon: <Clock className="h-3.5 w-3.5" />, urgent: true };
  return null;
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
  const session = await requirePagePermission("rfq.view", "/crm/dashboard");
  const canManage = hasPermission(session.role, "rfq.manage");
  const sp = await searchParams;
  const statusFilter = sp?.status ?? "open";

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
  const assignmentUsers = rfqAssigneeOptions(users);

  const filtered = rfqs.filter((r) => matchesStatusTab(r, statusFilter));
  const alertCounts = Object.entries(ALERT_VIEWS).map(([key, v]) => ({ key, label: v.chip, count: rfqs.filter(v.match).length }));
  const extraFilter = !VIEWS.some((v) => v.key === statusFilter)
    ? (ALERT_VIEWS[statusFilter]?.label ?? STATUS_LABEL[statusFilter]?.label ?? null)
    : null;

  return (
    <div className="min-w-0">
      <Breadcrumbs items={[
        { label: "Tổng quan", href: "/crm/dashboard" },
        { label: "RFQ" },
      ]} />
      <PageHeader
        title="RFQ trực tiếp"
        sub="Gửi thẳng tới một nhà cung cấp từ trang sản phẩm hoặc doanh nghiệp. Câu hỏi trực tiếp không tính SLA báo giá."
      />
      {sourcingCount > 0 && (
        <p className="mt-2 text-[12.5px] text-ink-600">
          {sourcingCount} yêu cầu không chọn nhà cung cấp nằm ở{" "}
          <Link href="/crm/sourcing" className="font-semibold text-brand-700 hover:underline">Tìm nguồn</Link>, nơi Vexim ghép nhà cung cấp.
        </p>
      )}

      {alertCounts.some((a) => a.count > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {alertCounts.filter((a) => a.count > 0).map((a) => (
            <Link key={a.key} href={`/crm/rfqs?status=${a.key}`}
              className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold " +
                (statusFilter === a.key ? "border-red-300 bg-red-100 text-red-800" : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100")}>
              {a.key === "unassigned" ? <UserX className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {a.count} {a.label}
            </Link>
          ))}
        </div>
      )}

      <nav aria-label="Lọc RFQ" className="mt-4 flex gap-1 overflow-x-auto border-b border-ink-200">
        {VIEWS.map((t) => {
          const n = rfqs.filter(t.match).length;
          const active = statusFilter === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "open" ? "/crm/rfqs" : `/crm/rfqs?status=${t.key}`}
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
          sub="Khi người mua gửi RFQ từ trang công khai, yêu cầu sẽ hiện ở đây."
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
                const sla = slaInfo(r);
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
                        {question && <span className="text-teal-700"> · câu hỏi trực tiếp</span>}
                        {detail && ` · ${detail}`}
                      </div>
                    </td>
                    <td className="max-w-[220px] px-3 py-2.5">
                      <div className="truncate text-[13px] text-ink-900">{buyer?.company ?? "—"}</div>
                      {buyer?.country && <div className="truncate text-[11.5px] text-ink-500">{buyer.country}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {canManage ? (
                        <RfqAssignmentSelect rfqId={r.id} assignedTo={r.assigned_to}
                          users={r.assigned_to && !assignmentUsers.some((u) => u.id === r.assigned_to) ? rfqAssigneeOptions(users, r.assigned_to) : assignmentUsers} />
                      ) : (
                        <span className="text-[12.5px] text-ink-700">{assigned ? assigneeLabel(assigned) : "Chưa phân công"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className="inline-flex items-center gap-1">
                        <span className={"h-1.5 w-1.5 rounded-full " + meta.dotClass} />
                        {meta.label}
                      </Badge>
                      {sla && (
                        <div className={"mt-1 flex items-center gap-1 text-[11.5px] font-medium " + sla.tone}>
                          {sla.icon}{sla.label}
                        </div>
                      )}
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
