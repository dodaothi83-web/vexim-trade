import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  AlertTriangle,
  Clock,
  Filter,
  Inbox,
  MailCheck,
  Send,
  Timer,
} from "lucide-react";

import { Breadcrumbs, Badge, EmptyState } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { assignRfqInlineAction } from "./actions-inline";
import type { AppUser, Buyer, Rfq } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_TABS: { key: string; label: string; dotClass?: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "question", label: "Câu hỏi NCC", dotClass: "bg-teal-500" },
  { key: "new", label: "Mới", dotClass: "bg-slate-400" },
  { key: "needs_review", label: "Cần duyệt", dotClass: "bg-rose-500" },
  { key: "in_progress", label: "Đang xử lý", dotClass: "bg-sky-500" },
  { key: "matching", label: "Đang ghép NCC", dotClass: "bg-amber-500" },
  { key: "quoted", label: "Đã báo giá", dotClass: "bg-amber-600" },
  { key: "sampling", label: "Đang gửi mẫu", dotClass: "bg-violet-500" },
  { key: "won", label: "Thành công", dotClass: "bg-emerald-500" },
  { key: "lost", label: "Thất bại", dotClass: "bg-ink-400" },
  { key: "spam", label: "Cách ly", dotClass: "bg-red-500" },
];

function isSupplierQuestion(rfq: Rfq) {
  return rfq.source_page === "/rfq?intent=question" || rfq.specs?.inquiry_kind === "supplier_question";
}

function matchesStatusTab(rfq: Rfq, tab: string) {
  if (tab === "all") return true;
  if (tab === "question") return isSupplierQuestion(rfq);
  return !isSupplierQuestion(rfq) && rfq.status === tab;
}

function statusMeta(s: string, question = false) {
  if (question && s === "matching") return { key: s, label: "Đã gửi câu hỏi", dotClass: "bg-emerald-500" };
  if (question && s === "new") return { key: s, label: "Chờ giao câu hỏi", dotClass: "bg-amber-500" };
  if (question && s === "needs_review") return { key: s, label: "Cần duyệt câu hỏi", dotClass: "bg-rose-500" };
  return (
    STATUS_TABS.find((t) => t.key === s) ?? {
      key: s,
      label: s,
      dotClass: "bg-ink-400",
    }
  );
}

const SLA_ASSIGN_HOURS = 4;     // phân công trong vòng 4 giờ làm việc
const SLA_RESPONSE_HOURS = 24;  // phản hồi buyer trong vòng 24 giờ làm việc
const ACTIVE_ASSIGN: Array<Rfq["status"]> = ["new", "needs_review"];
const ACTIVE_RESPONSE: Array<Rfq["status"]> = ["new", "needs_review", "in_progress", "matching"];
const CLOSED: Array<Rfq["status"]> = ["won", "lost", "spam"];

function slaInfo(rfq: Rfq): { label: string; tone: string } {
  const created = new Date(rfq.created_at).getTime();
  const now = Date.now();
  const ageHours = (now - created) / 3_600_000;
  if (rfq.status === "spam") return { label: "cách ly spam", tone: "text-red-700" };
  if (isSupplierQuestion(rfq)) {
    if (rfq.status === "needs_review") return { label: "chờ duyệt câu hỏi", tone: "text-rose-700" };
    if (rfq.status === "matching") return { label: "đã gửi trực tiếp", tone: "text-emerald-700" };
    if (rfq.status === "new" || rfq.status === "in_progress") return { label: "chờ hỗ trợ giao", tone: "text-amber-700" };
    return { label: "câu hỏi trực tiếp", tone: "text-ink-500" };
  }
  if (rfq.status === "needs_review") {
    if (!rfq.assigned_to && ageHours >= SLA_ASSIGN_HOURS) return { label: "review overdue", tone: "text-red-700" };
    return { label: "chờ duyệt", tone: "text-rose-700" };
  }
  if (rfq.status === "won") return { label: "won", tone: "text-emerald-700" };
  if (rfq.status === "lost") return { label: "lost", tone: "text-ink-500" };
  if (ACTIVE_ASSIGN.includes(rfq.status) && !rfq.assigned_to && ageHours >= SLA_ASSIGN_HOURS) return { label: `chưa phân công ${SLA_ASSIGN_HOURS}h+`, tone: "text-red-700" };
  if (ACTIVE_RESPONSE.includes(rfq.status) && !rfq.first_response_at && ageHours >= SLA_RESPONSE_HOURS - 4) return { label: "hồi đáp sắp trễ", tone: "text-amber-700" };
  if (rfq.first_response_at) return { label: "đã hồi đáp", tone: "text-emerald-700" };
  return { label: `${Math.max(0, Math.round(ageHours * 10) / 10)}h trước`, tone: "text-ink-500" };
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
  const [rfqs, users, buyers] = await Promise.all([
    store.listRfqs(),
    store.listUsers().catch(() => [] as AppUser[]),
    store.listBuyers().catch(() => [] as Buyer[]),
  ]);
  const buyerMap = new Map(buyers.map((b) => [b.id, b]));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const filtered = rfqs.filter((r) => matchesStatusTab(r, statusFilter));



  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[
        { label: "Tổng quan", href: "/crm/dashboard" },
        { label: "RFQ" },
      ]} />
      <PageHeader
        title="Hộp thư RFQ công khai"
        sub="Yêu cầu báo giá: phân công trong 4h, phản hồi buyer trong 24h (giờ làm việc Hanoi). Câu hỏi trực tiếp có tab riêng và không tính SLA báo giá."
      />

      <div className="mt-4 flex flex-wrap items-center gap-1 border-b border-ink-200">
        {STATUS_TABS.map((t) => {
          const n = rfqs.filter((r) => matchesStatusTab(r, t.key)).length;
          const active = statusFilter === t.key;
          return (
            <Link
              key={t.key}
              href={t.key === "all" ? "/crm/rfqs" : `/crm/rfqs?status=${t.key}`}
              className={
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold transition " +
                (active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-500 hover:text-ink-800")
              }
            >
              {t.dotClass && <span className={"h-1.5 w-1.5 rounded-full " + t.dotClass} />}
              {t.label}
              <span className="rounded-full bg-ink-100 px-1.5 text-[11px] text-ink-500">{n}</span>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Không có yêu cầu nào"
          sub="Khi buyer gửi RFQ từ trang công khai, yêu cầu sẽ hiện ở đây."
        />
      ) : (
        <div className="card mt-4 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-[11.5px] uppercase tracking-wider text-ink-500">
                <th className="px-3 py-2">Mã</th>
                <th className="px-3 py-2">Buyer</th>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2">Số lượng</th>
                <th className="px-3 py-2">Điểm đến</th>
                <th className="px-3 py-2">Phụ trách</th>
                <th className="px-3 py-2">SLA</th>
                <th className="px-3 py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((r) => {
                const buyer = buyerMap.get(r.buyer_id);
                const meta = statusMeta(r.status, isSupplierQuestion(r));
                const sl = slaInfo(r);
                const assigned = r.assigned_to ? userMap.get(r.assigned_to) : null;
                const slaIcons: Record<string, React.ReactNode> = {
                  "spam quarantine": <AlertTriangle className="h-3.5 w-3.5 text-red-600" />,
                  "unassigned 4h+": <Timer className="h-3.5 w-3.5 text-red-600" />,
                  "response due": <Clock className="h-3.5 w-3.5 text-amber-600" />,
                  replied: <MailCheck className="h-3.5 w-3.5 text-emerald-600" />,
                  closed: <Send className="h-3.5 w-3.5 text-ink-400" />,
                };
                return (
                  <tr key={r.id} className="transition hover:bg-ink-50/60">
                    <td className="px-3 py-2 font-mono text-[12.5px] font-semibold text-ink-900">
                      <Link href={`/crm/rfqs/${r.id}`} className="hover:text-brand-700">
                        {r.code}
                      </Link>
                      {r.spam_score > 0 && (
                        <span className="ml-1 text-[10.5px] text-ink-400">s{r.spam_score}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-[13px] font-semibold text-ink-900">{buyer?.company ?? "—"}</div>
                      <div className="text-[11.5px] text-ink-500">{buyer?.country ?? ""}{buyer?.email ? ` · ${buyer.email}` : ""}</div>
                    </td>
                    <td className="px-3 py-2 max-w-[300px]">
                      <div className="truncate text-[13px] text-ink-800">{r.product_text}</div>
                    </td>
                    <td className="px-3 py-2 text-[12.5px] text-ink-700">
                      {r.quantity && r.unit ? `${r.quantity} ${r.unit}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[12.5px] text-ink-700">{r.destination_country ?? "—"}</td>
                    <td className="px-3 py-2">
                      <form action={assignRfqInlineAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        <select
                          name="to"
                          defaultValue={r.assigned_to ?? ""}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                          className="input py-1 text-[12px]"
                        >
                          <option value="">— Chưa phân công —</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name ?? u.email}
                            </option>
                          ))}
                        </select>
                      </form>
                    </td>
                    <td className="px-3 py-2">
                      <span className={"inline-flex items-center gap-1 text-[12px] font-medium " + sl.tone}>
                        {slaIcons[sl.label] ?? <Clock className="h-3.5 w-3.5" />}
                        {sl.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className="inline-flex items-center gap-1">
                        {meta.dotClass && <span className={"h-1.5 w-1.5 rounded-full " + meta.dotClass} />}
                        {meta.label}
                      </Badge>
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
