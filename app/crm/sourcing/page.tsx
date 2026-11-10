import Link from "next/link";
import { ArrowRight, ChevronDown, FileText, Paperclip } from "lucide-react";

import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import { sourcingStore } from "@/lib/sourcing/store";
import { sourcingCrmStatusLabel, sourcingStatuses } from "@/lib/sourcing/status";
import { findLinkedRfq, sourcingSummary } from "@/lib/sourcing/to-rfq";
import { linkedSourcingRequestId, rfqChannel } from "@/lib/rfq/channel";
import { assigneeLabel } from "@/lib/rfq/assignees";
import type { AppUser, Buyer, Rfq, SourcingRequest } from "@/lib/types";
import { startSourcingMatchAction, updateSourcingAction } from "./actions";
import { MessageTimeline } from "@/components/message-timeline";
import { toTimelineItem } from "@/lib/mail/timeline";
import { sourcingThreadId } from "@/lib/rfq/reply-routing";
import type { EmailMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Hộp thư Tìm nguồn: mọi yêu cầu cần Vexim ghép và giới thiệu nhà cung cấp.
 * Gồm yêu cầu viết tự do (nút "Yêu cầu tìm nguồn") và RFQ gửi từ form /rfq mà
 * không chọn nhà cung cấp nào. RFQ gửi thẳng tới một nhà cung cấp nằm ở /crm/rfqs.
 */
type Stage = "new" | "working" | "closed";
const TABS: { key: Stage | "all"; label: string }[] = [
  { key: "new", label: "Cần tiếp nhận" },
  { key: "working", label: "Đang ghép" },
  { key: "closed", label: "Đã kết thúc" },
  { key: "all", label: "Tất cả" },
];

const RFQ_STATUS: Record<string, string> = {
  new: "Mới — chưa tiếp nhận", needs_review: "Cần duyệt", in_progress: "Đang xử lý", matching: "Đang ghép nhà cung cấp",
  quoted: "Đã nhận báo giá", sampling: "Đang gửi mẫu", won: "Thành công", lost: "Thất bại", spam: "Cách ly",
};

function rfqStage(status: Rfq["status"]): Stage {
  if (status === "new" || status === "needs_review") return "new";
  if (status === "won" || status === "lost" || status === "spam") return "closed";
  return "working";
}
function requestStage(r: SourcingRequest, linked: Rfq | null): Stage {
  if (linked) return rfqStage(linked.status);
  return r.status === "new" ? "new" : r.status === "closed" ? "closed" : "working";
}
function tabFromQuery(status?: string): Stage | "all" {
  if (status === "working" || status === "in_progress" || status === "needs_info") return "working";
  if (status === "closed") return "closed";
  if (status === "all") return "all";
  return "new";
}
const when = (iso: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(iso));

type Item =
  | { kind: "request"; at: string; stage: Stage; request: SourcingRequest; linked: Rfq | null }
  | { kind: "rfq"; at: string; stage: Stage; rfq: Rfq };

export default async function SourcingInbox({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; saved?: string; open?: string; mailed?: string }> }) {
  const actor = await requirePagePermission("rfq.view", "/crm/dashboard");
  const query = await searchParams;
  const manage = hasPermission(actor.role, "rfq.manage");
  const store = sourcingStore();
  const main = getStore();
  const [requests, users, allRfqs, buyers] = await Promise.all([
    store.listSourcingRequests(),
    store.listUsers(),
    main.listRfqs().catch(() => [] as Rfq[]),
    main.listBuyers().catch(() => [] as Buyer[]),
  ]);
  // Thư thông báo và email người mua trả lời trước đây; không dùng email để giao dịch RFQ mới.
  const threadMessages = await main.listMessagesForThreads(requests.map((r) => sourcingThreadId(r.id)))
    .catch((error) => { console.error("[sourcing] could not read request emails", error); return [] as EmailMessage[]; });
  const messagesByThread = new Map<string, EmailMessage[]>();
  for (const msg of threadMessages) messagesByThread.set(msg.thread_id, [...(messagesByThread.get(msg.thread_id) ?? []), msg]);
  // Thư mới nhất là thư người mua gửi tới: nhân viên cần đọc và xử lý tiếp.
  const buyerReplied = (id: string) => messagesByThread.get(sourcingThreadId(id))?.[0]?.kind === "inbound";
  const staff = users.filter((u) => u.is_active && hasPermission(u.role, "rfq.manage"));
  const userMap = new Map<string, AppUser>(users.map((u) => [u.id, u]));
  const buyerMap = new Map(buyers.map((b) => [b.id, b]));
  const sourcingRfqs = allRfqs.filter((r) => rfqChannel(r) === "sourcing");

  const items: Item[] = [
    ...requests.map((request) => {
      const linked = findLinkedRfq(sourcingRfqs, request.id);
      return { kind: "request" as const, at: request.created_at, stage: requestStage(request, linked), request, linked };
    }),
    // RFQ đã liên kết với một yêu cầu tìm nguồn hiện trong dòng của yêu cầu đó, không lặp lại.
    ...sourcingRfqs.filter((rfq) => !linkedSourcingRequestId(rfq))
      .map((rfq) => ({ kind: "rfq" as const, at: rfq.created_at, stage: rfqStage(rfq.status), rfq })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const tab = tabFromQuery(query.status);
  const counts = Object.fromEntries(TABS.map((t) => [t.key, t.key === "all" ? items.length : items.filter((i) => i.stage === t.key).length]));
  const rows = tab === "all" ? items : items.filter((i) => i.stage === tab);
  const owner = (id: string | null | undefined) => (id && userMap.get(id) ? assigneeLabel(userMap.get(id)!) : "Chưa phân công");

  return <div className="min-w-0 space-y-4">
    <header>
      <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Hộp thư tìm nguồn</p>
      <h1 className="mt-2 text-2xl font-bold">Yêu cầu tìm nguồn</h1>
      <p className="mt-2 text-sm text-ink-500">
        Người mua chưa chọn nhà cung cấp. Bấm <strong>Ghép nhà cung cấp</strong> để mở shortlist, mời bên có cổng đã duyệt rồi trao đổi qua mạch Vexim riêng. Liên hệ người mua không chuyển cho NCC; báo giá chỉ hiện khi Vexim công bố. Email cũ và email thông báo chỉ để xem; sau khi mở RFQ, trao đổi trong cổng.
      </p>
    </header>

    <nav aria-label="Lọc yêu cầu tìm nguồn" className="flex gap-1 overflow-x-auto border-b border-ink-200">
      {TABS.map((t) => (
        <Link key={t.key} href={t.key === "new" ? "/crm/sourcing" : `/crm/sourcing?status=${t.key}`} aria-current={tab === t.key ? "page" : undefined}
          className={"inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-semibold transition " +
            (tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800")}>
          {t.label}
          <span className={"rounded-full px-1.5 text-[11px] " + (t.key === "new" && counts.new > 0 ? "bg-amber-100 font-bold text-amber-800" : "bg-ink-100 text-ink-500")}>{counts[t.key]}</span>
        </Link>
      ))}
    </nav>

    {query.error && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{
      query.error === "conflict" ? "Yêu cầu đã được người khác cập nhật. Hãy kiểm tra phiên bản mới trước khi lưu lại."
        : query.error === "assignee" ? "Người phụ trách không hợp lệ hoặc không có quyền xử lý."
          : query.error === "closed" ? "Yêu cầu đã kết thúc. Mở lại (chuyển Đang xử lý) trước khi ghép nhà cung cấp."
            : "Dữ liệu không hợp lệ. Khi cần bổ sung thông tin, hãy nhập phản hồi cho người mua."}</p>}
    {query.saved && (query.mailed === "0"
      ? <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Đã lưu phản hồi nhưng chưa gửi được email thông báo. Người mua vẫn thấy nội dung trong tài khoản.</p>
      : <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{query.mailed === "1" ? "Đã lưu phản hồi trong tài khoản và gửi email thông báo cho người mua." : "Đã lưu cập nhật."}</p>)}

    {!rows.length ? <p className="rounded-xl border border-ink-200 bg-white p-8 text-center text-sm text-ink-500">Chưa có yêu cầu trong nhóm này.</p> : (
      <ul className="card divide-y divide-ink-100 overflow-hidden">
        {rows.map((item) => {
          if (item.kind === "rfq") {
            const r = item.rfq;
            const buyer = buyerMap.get(r.buyer_id);
            const detail = [r.quantity && r.unit ? `${r.quantity} ${r.unit}` : null, r.destination_country].filter(Boolean).join(" · ");
            return <li key={`rfq-${r.id}`}>
              <Link href={`/crm/rfqs/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-ink-50/60">
                <span className="min-w-0 flex-1 basis-full sm:basis-0">
                  <span className="block truncate text-[14px] font-semibold text-ink-900">{r.product_text || r.code}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-500">{buyer?.company ?? "—"} · <span className="font-mono">{r.code}</span>{detail && ` · ${detail}`} · {when(r.created_at)}</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-600"><FileText className="h-3 w-3" /> Form RFQ</span>
                <span className="text-[12px] font-semibold text-brand-700">{RFQ_STATUS[r.status] ?? r.status}</span>
                <span className="w-32 truncate text-right text-[12px] text-ink-500">{owner(r.assigned_to)}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink-400" />
              </Link>
            </li>;
          }
          const r = item.request;
          const linked = item.linked;
          return <li key={r.id}>
            <details className="group" open={query.saved === r.id || query.open === r.id}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-ink-50/60">
                <span className="min-w-0 flex-1 basis-full sm:basis-0">
                  <span className="block truncate text-[14px] font-semibold text-ink-900">{sourcingSummary(r.content)}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-500">{r.buyer_email} · {r.id.slice(0, 8).toUpperCase()} · {when(r.created_at)}{r.attachments.length > 0 && ` · ${r.attachments.length} tệp`}</span>
                </span>
                {buyerReplied(r.id) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800">Thư cũ từ người mua</span>}
                <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-800">Viết tự do</span>
                <span className="text-[12px] font-semibold text-brand-700">
                  {linked ? `${RFQ_STATUS[linked.status] ?? linked.status} · ${linked.code}` : sourcingCrmStatusLabel(r.status)}
                </span>
                <span className="w-32 truncate text-right text-[12px] text-ink-500">{owner(linked?.assigned_to ?? r.assigned_to)}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition group-open:rotate-180" />
              </summary>
              <div className="border-t border-ink-100 bg-ink-50/40 px-4 py-4">
                <p className="whitespace-pre-wrap break-words text-sm leading-7 text-ink-800">{r.content}</p>
                {!!r.attachments.length && <ul className="mt-3 space-y-1.5">{r.attachments.map((f) => <li key={f.id} className="flex items-center gap-1.5 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-ink-400" />
                  <a href={`/api/buyer/sourcing/${r.id}/files/${f.id}`} className="break-all font-semibold text-brand-700 underline">{f.name}</a>
                  <span className="text-xs text-ink-500">{Math.ceil(f.size / 1024)} KB</span>
                </li>)}</ul>}

                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-white p-3 text-[13px]">
                  {linked ? <>
                    <span className="text-ink-700">Đang ghép nhà cung cấp trong <strong className="font-mono">{linked.code}</strong> ({RFQ_STATUS[linked.status] ?? linked.status}).</span>
                    <Link href={`/crm/rfqs/${linked.id}`} className="btn btn-primary btn-sm ml-auto">Mở trang ghép <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </> : manage && r.status !== "closed" ? <form action={startSourcingMatchAction} className="flex w-full flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <span className="text-ink-700">Tạo RFQ tìm nguồn để chọn và mời NCC trên cổng. Chưa gửi gì cho NCC; yêu cầu cũ thiếu xác nhận tìm nguồn riêng không thể gửi lời mời.</span>
                    <button className="btn btn-primary btn-sm ml-auto">Ghép nhà cung cấp</button>
                  </form> : <span className="text-ink-500">{r.status === "closed" ? "Yêu cầu đã kết thúc." : "Cần quyền xử lý RFQ để ghép nhà cung cấp."}</span>}
                </div>

                <div className="mt-4">
                  <MessageTimeline title="Lịch sử email và thông báo (chỉ đọc)" items={(messagesByThread.get(sourcingThreadId(r.id)) ?? []).map((msg) => toTimelineItem(msg))}
                    empty="Chưa có email nào cho yêu cầu này." />
                </div>

                {manage && !linked ? <form action={updateSourcingAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="version" value={r.version} />
                  <label className="text-sm font-semibold">Trạng thái<select name="status" defaultValue={r.status} className="input mt-2 w-full">{sourcingStatuses.map((s) => <option key={s} value={s}>{sourcingCrmStatusLabel(s)}</option>)}</select></label>
                  <label className="text-sm font-semibold">Người phụ trách<select name="assigned_to" defaultValue={r.assigned_to ?? ""} className="input mt-2 w-full"><option value="">Chưa phân công</option>{staff.map((u) => <option key={u.id} value={u.id}>{assigneeLabel(u)}</option>)}</select></label>
                  <label className="text-sm font-semibold">Phản hồi cho người mua<textarea name="buyer_reply" defaultValue={r.buyer_reply ?? ""} maxLength={3000} rows={3} className="input mt-2 w-full" /><span className="mt-1 block text-xs font-normal text-ink-500">Hiện trong tài khoản người mua; email chỉ báo có cập nhật. Sau khi mở RFQ, trao đổi qua mạch Vexim.</span></label>
                  <label className="text-sm font-semibold">Ghi chú nội bộ<textarea name="internal_note" defaultValue={r.internal_note ?? ""} maxLength={3000} rows={3} className="input mt-2 w-full" /><span className="mt-1 block text-xs font-normal text-ink-500">Chỉ nhân viên CRM được xem.</span></label>
                  <button className="btn btn-soft justify-self-start sm:col-span-2">Lưu cập nhật</button>
                </form> : <div className="mt-4 space-y-2 text-sm">
                  {linked && <p className="rounded-lg bg-brand-50 p-3 text-ink-700">Yêu cầu ban đầu chỉ để xem. Cập nhật và nhắn tin qua RFQ {linked.code}; email chỉ để thông báo.</p>}
                  <p>Phụ trách: {owner(r.assigned_to)}</p>
                  {r.buyer_reply && <p className="whitespace-pre-wrap">Phản hồi: {r.buyer_reply}</p>}
                  {r.internal_note && <p className="whitespace-pre-wrap">Nội bộ: {r.internal_note}</p>}
                </div>}
              </div>
            </details>
          </li>;
        })}
      </ul>
    )}
  </div>;
}
