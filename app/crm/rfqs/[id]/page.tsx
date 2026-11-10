import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  Clock4,
  FlaskConical,
  Globe,
  Mail,
  MessageCircle,
  MapPin,
  Package,
  Phone,
  Send,
  ShieldAlert,
  Tag,
  Timer,
  Trophy,
} from "lucide-react";

import { Breadcrumbs, Badge } from "@/components/ui";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { ActionForm, PendingButton } from "@/components/action-form";
import { MessageTimeline } from "@/components/message-timeline";
import { toTimelineItem } from "@/lib/mail/timeline";
import { sourcingThreadId } from "@/lib/rfq/reply-routing";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { updateRfqStatusFormAction } from "../actions";
import { RfqAssignmentSelect } from "../assignment-select";
import { assigneeLabel, rfqAssigneeOptions } from "@/lib/rfq/assignees";
import {
  addMatchAction,
  removeMatchAction,
  updateMatchStatusAction,
} from "./actions";
import {
  presentShortlistAction,
  selectSupplierAction,
  sendRfqToSuppliersAction,
} from "./outreach-actions";
import {
  markLostAction,
  markSamplingAction,
} from "./compose-action";
import { hasPermission } from "@/lib/auth/permissions";
import { uploadRfqAttachmentAction } from "./upload-action";
import { addRfqNoteAction } from "./note-action";
import type { RfqMatch, RfqStatus, Supplier } from "@/lib/types";
import { approvedL2Scope, approvedVerificationSteps, verificationLabel, type PublicL2Scope } from "@/lib/verification-status";
import { spamFlagDetail } from "@/lib/rfq/spam-flags";
import {
  CLOSED_RFQ_STATUSES,
  MANUAL_MATCH_STATUSES,
  MANUAL_RFQ_STATUSES,
  isSupplierQuestionRfq,
} from "@/lib/rfq/workflow";
import { linkedSourcingRequestId, rfqChannel } from "@/lib/rfq/channel";
import { sourcingInviteConsent } from "@/lib/rfq/buyer-contact";
import { canUseMediatedDesk, canReadMediatedDesk, safeMediatedMessages, deskHasNewReply } from "@/lib/rfq/mediated";
import { RfqMediatedThread } from "@/components/rfq-mediated-thread";
import { staffVeximMessageAction, staffVeximReadAction } from "./mediation-actions";
import { portalApproved } from "@/lib/supplier-portal/onboarding";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<RfqStatus, { label: string; dot: string }> = {
  new: { label: "Mới tiếp nhận", dot: "bg-slate-400" },
  needs_review: { label: "Cần duyệt", dot: "bg-rose-500" },
  in_progress: { label: "Đang xử lý", dot: "bg-sky-500" },
  matching: { label: "Đang ghép nhà cung cấp", dot: "bg-amber-500" },
  quoted: { label: "Đã nhận báo giá", dot: "bg-amber-600" },
  sampling: { label: "Đang gửi mẫu", dot: "bg-violet-500" },
  won: { label: "Thành công", dot: "bg-emerald-500" },
  lost: { label: "Thất bại", dot: "bg-ink-400" },
  spam: { label: "Cách ly spam", dot: "bg-red-500" },
};

/** Các bước hiển thị trên thanh tiến trình; gửi mẫu là bước tuỳ chọn. */
const STEPS: { label: string; statuses: RfqStatus[] }[] = [
  { label: "Tiếp nhận", statuses: ["new", "needs_review", "in_progress"] },
  { label: "Ghép nhà cung cấp", statuses: ["matching"] },
  { label: "Báo giá", statuses: ["quoted"] },
  { label: "Gửi mẫu (tuỳ chọn)", statuses: ["sampling"] },
  { label: "Kết quả", statuses: ["won", "lost"] },
];

const MATCH_STATUS: Record<string, { label: string; dot: string }> = {
  proposed: { label: "Đề xuất", dot: "bg-slate-400" },
  sent_to_supplier: { label: "Đã gửi nhà cung cấp", dot: "bg-sky-500" },
  quoted: { label: "Đã có báo giá", dot: "bg-emerald-500" },
  declined: { label: "Nhà cung cấp từ chối", dot: "bg-red-500" },
  no_response: { label: "Không phản hồi", dot: "bg-ink-400" },
  presented_to_buyer: { label: "Đã trình người mua", dot: "bg-violet-500" },
  selected: { label: "Được chọn", dot: "bg-emerald-600" },
  not_selected: { label: "Không được chọn", dot: "bg-ink-300" },
};

const LOST_REASONS: [string, string][] = [
  ["price", "Giá chưa cạnh tranh"],
  ["lead_time", "Không đáp ứng lead time"],
  ["quality", "Chất lượng / chứng chỉ chưa đủ"],
  ["no_response", "Nhà cung cấp không phản hồi"],
  ["buyer_went_elsewhere", "Người mua chọn nhà cung cấp khác"],
  ["cancelled", "Người mua huỷ yêu cầu"],
  ["other", "Khác"],
];

/** Tháng giao hàng dạng MM/YYYY; RFQ cũ vẫn dùng needed_by. */
function deliveryLabel(rfq: { needed_by?: string | null; specs?: unknown }) {
  const month = String((rfq.specs as Record<string, unknown> | null)?.shipment_month ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-");
    return `${m}/${y}`;
  }
  return rfq.needed_by ?? "—";
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false });
}

function supplierName(sup: Supplier | undefined, fallback: string) {
  return sup?.display_name ?? sup?.trade_name ?? sup?.name ?? fallback;
}

function quoteSummary(m: RfqMatch) {
  if (m.quote_price == null) return null;
  return [
    `${m.quote_price} ${m.quote_currency ?? ""}${m.quote_unit ? ` / ${m.quote_unit}` : ""}`.trim(),
    m.quote_incoterm,
    m.quote_lead_time_days != null ? `${m.quote_lead_time_days} ngày` : null,
  ].filter(Boolean).join(" · ");
}

export default async function RfqDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const session = await requirePagePermission("rfq.view", "/crm/dashboard");
  const hasManagePermission = hasPermission(session.role, "rfq.manage");
  const { id } = await params;
  const sp = await searchParams;
  const store = getStore();
  const rfq = await store.getRfq(id);
  if (!rfq) notFound();
  const channel = rfqChannel(rfq);
  const canManageRfq = hasManagePermission && channel === "sourcing";
  const [buyer, matches, suppliers, users, attachments, category, products, messages] = await Promise.all([
    store.getBuyer(rfq.buyer_id).catch(() => null),
    store.listRfqMatches(rfq.id).catch(() => []),
    store.listSuppliers().catch(() => []),
    store.listUsers().catch(() => []),
    store.listRfqAttachments(rfq.id).catch(() => []),
    rfq.category_id ? store.getCategory(rfq.category_id).catch(() => null) : Promise.resolve(null),
    store.listProducts().catch(() => []),
    store.listMessagesForRfq(rfq.id).catch(() => []),
  ]);

  const reviewedSteps = new Map<string, Array<1 | 2 | 3>>();
  const reviewedL2Scopes = new Map<string, PublicL2Scope>();
  const relevant = suppliers.filter((s) => s.status === "published" || matches.some((m) => m.supplier_id === s.id));
  for (let i = 0; i < relevant.length; i += 40) {
    await Promise.all(relevant.slice(i, i + 40).map(async (s) => {
      const reviews = await store.listVerifications(s.id).catch(() => []);
      reviewedSteps.set(s.id, approvedVerificationSteps(reviews));
      reviewedL2Scopes.set(s.id, approvedL2Scope(reviews));
    }));
  }
  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const productsBySupplier = new Map<string, (typeof products)[number][]>();
  for (const p of products) {
    const list = productsBySupplier.get(p.supplier_id) ?? [];
    list.push(p);
    productsBySupplier.set(p.supplier_id, list);
  }
  const matchSupplierIds = new Set(matches.map((m) => m.supplier_id));
  // NCC buyer đã chỉ định khi gửi RFQ từ trang sản phẩm hoặc trang NCC (không phải NCC Vexim tự chọn).
  const preferredSupplierIds = rfq.preferred_supplier_ids ?? [];
  // Chấm điểm theo các lần kiểm đã duyệt thực tế, không suy ra giấy tờ/nhà máy từ mức tối đa.
  const qText = (rfq.product_text + " " + (category?.name_i18n?.en ?? "")).toLowerCase();
  const activePortalIds = new Set(users.filter((u) => u.is_active && u.role === "supplier" && u.supplier_id)
    .map((u) => u.supplier_id));
  const candidates = suppliers
    .filter((s) => s.status === "published" && portalApproved(s) && activePortalIds.has(s.id) && !matchSupplierIds.has(s.id))
    .map((s) => {
      const prods = productsBySupplier.get(s.id) ?? [];
      let score = 0;
      const prodText = prods.map((p) => (p.name + " " + (p.category ?? "") + " " + (p.spec ?? ""))).join(" ").toLowerCase();
      if (prods.some((p) => qText.split(/\s+/).some((w) => w.length >= 3 && (p.name.toLowerCase().includes(w) || (p.category ?? "").toLowerCase().includes(w))))) score += 3;
      else if (prodText && qText.split(/\s+/).some((w) => w.length >= 4 && prodText.includes(w))) score += 1;
      score += (reviewedSteps.get(s.id)?.length ?? 0) * 1.5;
      if (s.lead_time_days && s.moq_text) score += 1;
      return { s, score };
    })
    .filter((x) => x.score > 0 || suppliers.length <= 30) // Không kết quả khớp thì vẫn hiện
    .sort((a, b) => b.score - a.score || ((reviewedSteps.get(b.s.id)?.length ?? 0) - (reviewedSteps.get(a.s.id)?.length ?? 0)))
    .slice(0, 50)
    .map((x) => x.s);

  // RFQ tạo từ yêu cầu tìm nguồn: thư với người mua trước khi ghép cũng thuộc câu chuyện này.
  const linkedRequestId = linkedSourcingRequestId(rfq);
  const timelineMessages = linkedRequestId
    ? [...messages, ...(await store.listMessagesForThreads([sourcingThreadId(linkedRequestId)]).catch(() => []))]
      .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    : messages;

  // Map match → messages
  const messagesByMatch = new Map<string, (typeof messages)[number][]>();
  for (const m of messages) {
    const mid = (m as unknown as { rfq_match_id?: string | null }).rfq_match_id;
    if (mid) {
      const list = messagesByMatch.get(mid) ?? [];
      list.push(m);
      messagesByMatch.set(mid, list);
    }
  }

  // RFQ portal conversations live separately from email; only staff with rfq.view
  // sees the per-match thread, and only inside this RFQ's actual matches.
  const portalThreads = new Map(await Promise.all(matches.filter((m) => !!m.sent_to_supplier_at).map(async (m) => [
    m.id, await store.listRfqThreadMessages(m.id).catch((error) => {
      console.error("[crm] RFQ portal conversation unavailable", error);
      return [];
    }),
  ] as const)));
  const isMediated = channel === "sourcing";
  let mediationUnavailable = false;
  const mediationThreads = isMediated ? await store.listRfqMediatedThreads([rfq.id])
    .catch((error) => { console.error("[crm] Vexim RFQ conversations unavailable", error); mediationUnavailable = true; return []; }) : [];
  const mediationById = new Map(mediationThreads.map((t) => [t.id, t]));
  const mediationMessages = new Map(await Promise.all(mediationThreads.map(async (t) => [t.id,
    safeMediatedMessages(await store.listRfqMediatedMessages(t.id).catch((error) => {
      console.error("[crm] RFQ desk messages unavailable", error); mediationUnavailable = true; return [];
    }))] as const)));
  const quoteVersions = await store.listRfqQuoteVersions(matches.filter((m) => !!m.sent_to_buyer_at).map((m) => m.id));
  const quoteVersionsByMatch = new Map<string, typeof quoteVersions>();
  for (const version of quoteVersions) quoteVersionsByMatch.set(version.match_id,
    [...(quoteVersionsByMatch.get(version.match_id) ?? []), version]);

  const specs = (rfq.specs as Record<string, unknown> | null) ?? {};
  const isSupplierQuestion = isSupplierQuestionRfq(rfq);
  // RFQ không chọn nhà cung cấp (hoặc tạo từ yêu cầu tìm nguồn) thuộc hộp thư Tìm nguồn.
  const isSourcing = isMediated;
  const sourcingRequestId = linkedSourcingRequestId(rfq);
  const isClosed = CLOSED_RFQ_STATUSES.includes(rfq.status);
  const canAct = canManageRfq && isSourcing && !isClosed;
  const statusInfo = isSupplierQuestion
    ? rfq.status === "matching" ? { label: "Đã gửi câu hỏi (lịch sử)", dot: "bg-slate-400" }
      : rfq.status === "spam" ? { label: "Cách ly (lịch sử)", dot: "bg-slate-400" }
        : { label: "Chưa xác nhận giao (lịch sử)", dot: "bg-slate-400" }
    : channel === "direct" && rfq.status === "matching"
      ? { label: "Đã chuyển tới nhà cung cấp", dot: STATUS_LABEL.matching.dot }
      : channel === "direct" && rfq.status === "new"
        ? { label: "Chưa xác nhận chuyển yêu cầu", dot: STATUS_LABEL.new.dot }
        : channel === "direct" && rfq.status === "quoted"
          ? { label: "Đã ghi báo giá", dot: STATUS_LABEL.quoted.dot }
          : STATUS_LABEL[rfq.status] ?? STATUS_LABEL.new;
  const assignee = users.find((u) => u.id === rfq.assigned_to);

  // Nhóm NCC theo việc cần làm để tính bước tiếp theo.
  const sendable = matches.filter((m) => m.status === "proposed" && !m.sent_to_supplier_at);
  const consentedSendable = sendable.filter((m) => sourcingInviteConsent(rfq, m.supplier_id));
  const awaiting = matches.filter((m) => m.status === "sent_to_supplier");
  const readyToPresent = matches.filter((m) => m.status === "quoted" && m.quote_price != null);
  const presented = matches.filter((m) => m.status === "presented_to_buyer" && quoteVersionsByMatch.has(m.id));
  const selectedMatch = matches.find((m) => m.status === "selected");
  const stepIndex = STEPS.findIndex((s) => s.statuses.includes(rfq.status));

  type NextStep = { text: React.ReactNode; tone?: "default" | "done" | "alert"; action?: React.ReactNode };
  const next: NextStep = (() => {
    if (channel === "direct") return { text: "RFQ đích danh thuộc người mua và nhà cung cấp. CRM chỉ xem để hỗ trợ, không xử lý. Nếu cần, tạo yêu cầu tìm nguồn mới." };
    if (isSupplierQuestion) return { text: "Câu hỏi cũ chỉ lưu lịch sử. Câu hỏi mới dùng Chat with supplier trên trang sản phẩm." };
    if (rfq.status === "spam") return { tone: "alert", text: "RFQ đang cách ly spam. Đối chiếu các dấu hiệu bên phải; nếu yêu cầu hợp lệ, chuyển về \"Đang xử lý\" ở mục Thao tác khác." };
    if (rfq.status === "won") return { tone: "done", text: <>Đã chốt thành công{selectedMatch ? <> với <strong>{supplierName(supplierMap.get(selectedMatch.supplier_id), "nhà cung cấp")}</strong></> : null}.</> };
    if (rfq.status === "lost") return { tone: "done", text: <>Đã đóng thất bại · lý do: <strong>{LOST_REASONS.find(([v]) => v === rfq.lost_reason)?.[1] ?? rfq.lost_reason ?? "—"}</strong>{rfq.closed_reason ? ` · ${rfq.closed_reason}` : ""}.</> };

    if (!canManageRfq) return { text: "Bạn đang ở chế độ chỉ xem." };
    if (rfq.status === "sampling" && selectedMatch) {
      const name = supplierName(supplierMap.get(selectedMatch.supplier_id), "nhà cung cấp");
      return {
        text: <>Đang gửi mẫu với <strong>{name}</strong>. Khi người mua đồng ý mẫu, chốt thành công.</>,
        action: (
          <form action={selectSupplierAction}>
            <input type="hidden" name="rfq_id" value={rfq.id} />
            <input type="hidden" name="match_id" value={selectedMatch.id} />
            <ConfirmSubmitButton className="btn btn-primary btn-sm" message={`Chốt thành công với ${name}? RFQ sẽ chuyển sang Thành công.`}>
              <Trophy className="h-3.5 w-3.5" /> Chốt thành công
            </ConfirmSubmitButton>
          </form>
        ),
      };
    }
    if (readyToPresent.length > 0) return {
      text: <>Có <strong>{readyToPresent.length}</strong> báo giá/bản điều chỉnh chờ trình. Công bố trong tài khoản người mua; email chỉ báo có cập nhật.</>,
      action: (
        <form action={presentShortlistAction}>
          <input type="hidden" name="rfq_id" value={rfq.id} />
          {readyToPresent.map((m) => <input key={m.id} type="hidden" name="publish_version" value={`${m.id}:${m.updated_at}`} />)}
          <ConfirmSubmitButton className="btn btn-primary btn-sm" message={`Công bố ${readyToPresent.length} báo giá/bản điều chỉnh vào tài khoản người mua? Email chỉ dùng để báo tin.`}>
            <Send className="h-3.5 w-3.5" /> Công bố báo giá
          </ConfirmSubmitButton>
        </form>
      ),
    };
    if (presented.length > 0) return { text: <>Chờ người mua chọn. Khi có phản hồi, bấm <strong>Gửi mẫu</strong> hoặc <strong>Chốt</strong> ở dòng nhà cung cấp tương ứng.</> };
    if (sendable.length > 0 && consentedSendable.length === 0) return { tone: "alert", text: <>RFQ chưa có đồng ý tìm nguồn riêng cho yêu cầu này. Không gửi cho nhà cung cấp cho đến khi người mua xác nhận.</> };
    if (sendable.length > 0) return { text: <>Có <strong>{sendable.length}</strong> nhà cung cấp chưa nhận RFQ. Chỉ mời bên có cổng đã duyệt; liên hệ người mua vẫn ở Vexim.</>, action: <a href="#suppliers" className="btn btn-primary btn-sm">Đến danh sách <ArrowRight className="h-3.5 w-3.5" /></a> };
    if (awaiting.length > 0) return { text: <>Đang chờ <strong>{awaiting.length}</strong> nhà cung cấp báo giá trên cổng. Trao đổi riêng với từng bên qua Vexim bên dưới.</> };
    return { text: "Chưa có nhà cung cấp phù hợp. Thêm nhà cung cấp vào shortlist để bắt đầu.", action: <a href="#suppliers" className="btn btn-primary btn-sm">Thêm nhà cung cấp <ArrowRight className="h-3.5 w-3.5" /></a> };
  })();

  const deliveryText = deliveryLabel(rfq);

  return (
    <div className="min-w-0">
      <Breadcrumbs items={[
        { label: "Tổng quan", href: "/crm/dashboard" },
        isSourcing ? { label: "Tìm nguồn", href: "/crm/sourcing?status=working" } : { label: "RFQ", href: "/crm/rfqs" },
        { label: rfq.code },
      ]} />

      {/* Đầu trang: mã, trạng thái, người chủ trì */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Link href={isSourcing ? "/crm/sourcing?status=working" : "/crm/rfqs"} className="btn btn-ghost btn-sm" aria-label={isSourcing ? "Quay lại hộp thư tìm nguồn" : "Quay lại hộp thư RFQ"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-mono text-xl font-bold text-ink-900">{rfq.code}</h1>
          <Badge className="inline-flex items-center gap-1">
            <span className={"h-2 w-2 shrink-0 rounded-full " + statusInfo.dot} />
            {statusInfo.label}
          </Badge>
          {isSupplierQuestion && <Badge color="#0f766e">Lịch sử câu hỏi nhà cung cấp</Badge>}
          {channel === "direct" && <Badge color="#0f766e">Đích danh · CRM chỉ xem</Badge>}
          {isSourcing && <Badge color="#0f766e">Tìm nguồn · Vexim ghép nhà cung cấp</Badge>}
          {rfq.status === "spam" && (
            <Badge color="#b91c1c" className="inline-flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" /> Điểm rủi ro {rfq.spam_score}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
          <span>{channel === "direct" ? "Liên hệ hỗ trợ" : "Chủ trì"}</span>
          {canManageRfq
            ? <RfqAssignmentSelect rfqId={rfq.id} assignedTo={rfq.assigned_to ?? null} users={rfqAssigneeOptions(users, rfq.assigned_to)} />
            : <span className="text-ink-800">{assignee ? assigneeLabel(assignee) : "Chưa phân công"}</span>}

        </div>
      </div>

      {sp?.published && Number(sp.published) > 0 && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Đã công bố {Number(sp.published)} báo giá/bản điều chỉnh trong tài khoản người mua. Nếu email thông báo lỗi, hệ thống sẽ thử gửi lại.</div>}
      {sp?.publish_skipped && Number(sp.publish_skipped) > 0 && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Có {Number(sp.publish_skipped)} báo giá chưa công bố do đã thay đổi hoặc không còn hợp lệ. Tải lại trang và kiểm tra nội dung trước khi công bố.</div>}
      {sp?.selection_email === "failed" && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Đã lưu nhà cung cấp được chọn nhưng email chưa gửi được. Hãy liên hệ ngoài hệ thống, đừng chọn lại.</div>}
      {sp?.selection_email === "sent" && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Đã gửi email báo nhà cung cấp được chọn. Hệ thống chưa xác nhận tới hộp thư.</div>}
      {sp?.outreach_sent !== undefined && <div role="status" className={`mt-4 rounded-lg border p-3 text-sm ${Number(sp.outreach_skipped) > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        Đã gửi {Number(sp.outreach_sent) || 0} lời mời nhà cung cấp; {Number(sp.outreach_skipped) || 0} yêu cầu chưa gửi (có thể đã gửi trước hoặc NCC chưa có cổng duyệt). Kiểm tra từng nhà cung cấp trước khi thử lại.
      </div>}

      {isSupplierQuestion && <p role="note" className="mt-4 rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm leading-6 text-ink-700">Câu hỏi cũ chỉ để xem; CRM không xử lý lại. Câu hỏi mới dùng Chat with supplier trên trang sản phẩm.</p>}
      {channel === "direct" && <p role="note" className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-900">
        <strong>Chỉ hỗ trợ/tranh chấp.</strong> Buyer và NCC đã chọn tự xem báo giá, trao đổi và chốt giao dịch trong cổng.
        CRM không phân công, đổi trạng thái, nhập giá hoặc gửi lời mời cho RFQ này. Nếu chưa chốt được, buyer tạo RFQ tìm nguồn MỚI.
      </p>}

      {/* Tiến trình + bước tiếp theo */}
      <section className="card mt-4 p-4 sm:p-5">
        {isSourcing && rfq.status !== "spam" && (
          <ol className="mb-4 grid grid-cols-5 gap-1.5" aria-label="Tiến trình RFQ">
            {STEPS.map((step, i) => {
              const done = i < stepIndex;
              const current = i === stepIndex;
              const label = i === STEPS.length - 1 && current ? STATUS_LABEL[rfq.status].label : step.label;
              return (
                <li key={step.label} aria-current={current ? "step" : undefined} className="min-w-0">
                  <div className={"h-1.5 rounded-full " + (done ? "bg-brand-600" : current ? (rfq.status === "lost" ? "bg-ink-400" : "bg-brand-400") : "bg-ink-100")} />
                  <p className={"mt-1.5 truncate text-[11.5px] " + (current ? "font-semibold text-ink-900" : done ? "text-ink-600" : "text-ink-400")}>
                    {done && <Check className="mr-0.5 inline h-3 w-3 text-brand-600" />}{label}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
        <div className={"flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2.5 text-[13px] " + (next.tone === "alert" ? "bg-red-50 text-red-900" : next.tone === "done" ? "bg-ink-50 text-ink-700" : "bg-brand-50 text-ink-800")}>
          <p className="min-w-0 flex-1"><span className="mr-1 font-semibold text-brand-900">{!isSourcing ? "Lưu ý:" : next.tone === "done" ? "Kết quả:" : "Bước tiếp theo:"}</span>{next.text}</p>
          {next.action}
        </div>
      </section>

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-3">
        {/* CỘT CHÍNH */}
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Yêu cầu</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
              <Field icon={<Package className="h-4 w-4" />} label="Sản phẩm" wide>
                {rfq.product_text}
                {category && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">
                    <Tag className="h-3 w-3" /> {String(category.name_i18n.en ?? category.name_i18n.vi ?? "")}
                  </span>
                )}
              </Field>
              <Field icon={<Tag className="h-4 w-4" />} label="Số lượng">
                {rfq.quantity && rfq.unit ? `${rfq.quantity} ${rfq.unit}` : "—"}
                {rfq.frequency ? <span className="ml-1 text-ink-500">/ {rfq.frequency}</span> : null}
              </Field>
              <Field icon={<MapPin className="h-4 w-4" />} label="Điểm đến · Incoterm">
                {rfq.destination_country ?? "—"}
                {String(specs.destination_port ?? "") && <span className="text-ink-500"> · {String(specs.destination_port)}</span>}
                <span className="text-ink-500"> · {rfq.incoterm ?? "—"}</span>
              </Field>
              <Field icon={<CalendarClock className="h-4 w-4" />} label="Giao hàng">{deliveryText}</Field>
              <Field icon={<Tag className="h-4 w-4" />} label="Giá mục tiêu">
                {rfq.target_price
                  ? `${rfq.target_price} ${rfq.target_price_currency ?? ""}${String(specs.target_price_unit ?? "") ? ` / ${String(specs.target_price_unit)}` : ""}`
                  : "—"}
                {rfq.target_price && (
                  <span className="ml-1 text-[11px] text-ink-500">
                    {specs.share_target_price === true ? "đã đồng ý chia sẻ cho nhà cung cấp" : "chưa chia sẻ cho nhà cung cấp"}
                  </span>
                )}
              </Field>
              <Field icon={<Timer className="h-4 w-4" />} label="Yêu cầu thêm">
                {[
                  rfq.wants_samples && "gửi mẫu",
                  rfq.wants_inspection && "kiểm định",
                  rfq.wants_video_call && "video call",
                ].filter(Boolean).join(", ") || "—"}
              </Field>
              <Field icon={<CalendarClock className="h-4 w-4" />} label="Nhận lúc">{fmtDate(rfq.created_at)}</Field>
              {sourcingRequestId && (
                <p className="sm:col-span-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-[12.5px] text-teal-900">
                  Tạo từ yêu cầu tìm nguồn {sourcingRequestId.slice(0, 8).toUpperCase()}.{" "}
                  <Link href={`/crm/sourcing?status=all&open=${sourcingRequestId}`} className="font-semibold underline">Xem yêu cầu gốc và tệp đính kèm</Link>
                </p>
              )}
              {String(specs.notes ?? "") && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-wider text-ink-400">{isSupplierQuestion ? "Câu hỏi từ người mua" : sourcingRequestId ? "Nội dung yêu cầu tìm nguồn" : "Ghi chú từ người mua"}</dt>
                  <dd className="mt-1 whitespace-pre-line rounded-md bg-ink-50 p-3 text-[13px] text-ink-700">{String(specs.notes)}</dd>
                </div>
              )}
            </dl>

            <h2 className="mt-5 border-t border-ink-100 pt-4 text-sm font-semibold uppercase tracking-wider text-ink-500">Người mua</h2>
            {buyer ? (
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2">
                <Field icon={<Building2 className="h-4 w-4" />} label="Công ty">
                  {buyer.company}
                  {(buyer.business_type || buyer.country) && <span className="text-ink-500"> · {[buyer.business_type, buyer.country].filter(Boolean).join(" · ")}</span>}
                </Field>
                <Field icon={<Mail className="h-4 w-4" />} label="Liên hệ">
                  {buyer.contact_name ?? "—"}
                  {buyer.email && <> · <span className="text-ink-800">{buyer.email}</span></>}
                </Field>
                {buyer.phone && <Field icon={<Phone className="h-4 w-4" />} label="Điện thoại">{buyer.phone}</Field>}
                {buyer.website && (
                  <Field icon={<Globe className="h-4 w-4" />} label="Website">
                    <a href={buyer.website.startsWith("http") ? buyer.website : `https://${buyer.website}`}
                       target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{buyer.website}</a>
                  </Field>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-ink-500">Không tìm thấy hồ sơ người mua.</p>
            )}
          </section>

          {/* Nhà cung cấp */}
          <section className="card scroll-mt-20 p-4 sm:p-5" id="suppliers">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                Nhà cung cấp ({matches.length})
              </h2>
              {canAct && consentedSendable.length > 0 && (
                <form id="rfq-dispatch" action={sendRfqToSuppliersAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="rfq_id" value={rfq.id} />
                  <label className="flex items-center gap-1 whitespace-nowrap text-[12px] text-ink-600">
                    Hạn phản hồi
                    <select name="deadline_days" defaultValue="3" className="input py-1 text-[12px]">
                      <option value="2">2 ngày</option>
                      <option value="3">3 ngày</option>
                      <option value="5">5 ngày</option>
                      <option value="7">7 ngày</option>
                    </select>
                  </label>
                  <ConfirmSubmitButton className="btn btn-primary btn-sm" message="Mời các nhà cung cấp đã chọn qua cổng? Liên hệ người mua vẫn riêng tư; email chỉ thông báo.">
                    <Mail className="h-3.5 w-3.5" /> Gửi yêu cầu báo giá
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>

            {preferredSupplierIds.length > 0 && (
              <p className="mt-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-[12.5px] leading-relaxed text-ink-700">
                <strong className="text-brand-900">Người mua chỉ định nhà cung cấp:</strong>{" "}
                {preferredSupplierIds.map((pid) => supplierName(supplierMap.get(pid), pid)).join(", ")}.{" "}
                {isSupplierQuestion
                  ? "Người mua chỉ đồng ý liên hệ nhà cung cấp này. Không thêm nhà cung cấp khác khi chưa có đồng ý mới."
                  : "Chỉ gửi cho đơn vị người mua chỉ định. Gửi cho nhà cung cấp khác cần có đồng ý riêng."}
              </p>
            )}
            {canAct && sendable.length > 0 && (
              <p className="mt-2 text-[12px] text-ink-500">Tích ô ở đầu dòng để chọn nhà cung cấp nhận yêu cầu báo giá.</p>
            )}

            <ul className="mt-2 divide-y divide-ink-100">
              {matches.length === 0 && (
                <li className="py-6 text-center text-[13px] text-ink-500">Chưa ghép nhà cung cấp nào.</li>
              )}
              {matches.map((m) => {
                const sup = supplierMap.get(m.supplier_id);
                const name = supplierName(sup, m.supplier_id);
                const ms = MATCH_STATUS[m.status] ?? MATCH_STATUS.proposed;
                const isSendable = m.status === "proposed" && !m.sent_to_supplier_at;
                const canFollowUp = isSourcing && canReadMediatedDesk(rfq, m);
                const versions = quoteVersionsByMatch.get(m.id) ?? [];
                const canDecide = m.status === "presented_to_buyer" && versions.length > 0 && rfq.status !== "sampling";
                const thread = messagesByMatch.get(m.id) ?? [];
                const portalThread = portalThreads.get(m.id) ?? [];
                const passed = reviewedSteps.get(m.supplier_id) ?? [];
                const quote = quoteSummary(m);
                return (
                  <li key={m.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      {canAct && isSendable && sourcingInviteConsent(rfq, m.supplier_id) && (
                        <input type="checkbox" name="match_ids" form="rfq-dispatch" value={m.id} defaultChecked
                          aria-label={`Gửi yêu cầu cho ${name}`} className="h-4 w-4 rounded border-ink-300 text-brand-600" />
                      )}
                      <Link href={`/crm/suppliers/${m.supplier_id}`} className="text-[14px] font-semibold text-ink-900 hover:text-brand-700">{name}</Link>
                      <Badge className="inline-flex items-center gap-1 text-[11px]">
                        <span className={"h-1.5 w-1.5 rounded-full " + ms.dot} />{ms.label}
                      </Badge>
                      {preferredSupplierIds.includes(m.supplier_id) && <Badge className="bg-brand-600 text-[10.5px] text-white">Người mua chỉ định</Badge>}
                      {isSendable && !sourcingInviteConsent(rfq, m.supplier_id) && <Badge className="bg-amber-50 text-[10.5px] text-amber-800">Cần đồng ý tìm nguồn</Badge>}
                      {passed.map((step) => <Badge key={step} color="#059669" className="text-[10.5px]">{verificationLabel(step, reviewedL2Scopes.get(m.supplier_id) ?? null)}</Badge>)}

                      {canAct && (
                        <div className="ml-auto flex flex-wrap items-center gap-1.5">
                          {canFollowUp && <a href={`#desk-${m.id}`} className="btn btn-ghost btn-sm">
                            <MessageCircle className="h-3.5 w-3.5" /> Trao đổi với NCC qua Vexim
                          </a>}
                          {canDecide && (
                            <>
                              <form action={markSamplingAction}>
                                <input type="hidden" name="rfq_id" value={rfq.id} />
                                <input type="hidden" name="selected_match_id" value={m.id} />
                                <ConfirmSubmitButton className="btn btn-soft btn-sm" title="Người mua chọn nhà cung cấp này và muốn nhận mẫu trước"
                                  message={`Gửi mẫu với ${name}?\n\n• ${name} được đánh dấu được chọn, các nhà cung cấp khác chuyển "Không được chọn".\n• Hệ thống gửi email cho ${name} và người mua.`}>
                                  <FlaskConical className="h-3.5 w-3.5" /> Gửi mẫu
                                </ConfirmSubmitButton>
                              </form>
                              <form action={selectSupplierAction}>
                                <input type="hidden" name="rfq_id" value={rfq.id} />
                                <input type="hidden" name="match_id" value={m.id} />
                                <ConfirmSubmitButton className="btn btn-primary btn-sm" title="Người mua chốt đơn, bỏ qua bước mẫu"
                                  message={`Chốt ${name} và đóng RFQ là Thành công (bỏ qua bước gửi mẫu)?\n\nCác nhà cung cấp khác chuyển "Không được chọn"; ${name} nhận email thông báo có link vào cổng.`}>
                                  <Trophy className="h-3.5 w-3.5" /> Chốt
                                </ConfirmSubmitButton>
                              </form>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="mt-1 text-[12px] text-ink-500">
                      {sup?.email && <span>Liên hệ NCC (chỉ nhân viên): {sup.email} · </span>}
                      {quote && <> · <span className="font-medium text-ink-800">{quote}</span></>}
                      {m.sent_to_supplier_at && <> · đã gửi yêu cầu {fmtDate(m.sent_to_supplier_at)}</>}
                      {versions.length > 0 && m.sent_to_buyer_at && <> · <span className="text-emerald-700">công bố trên tài khoản người mua {fmtDate(m.sent_to_buyer_at)}</span></>}
                      {m.status === "quoted" && <> · <span className="font-semibold text-amber-800">{versions.length > 0 ? "Bản điều chỉnh chưa công bố" : "Báo giá chưa công bố"}</span></>}
                      {thread.length > 0 && <> · {thread.length} thư</>}
                      {portalThread.length > 0 && <> · {portalThread.length} tin trực tiếp trên cổng</>}
                    </p>
                    {versions.length > 0 && <details className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/40 px-3 py-2">
                      <summary className="cursor-pointer text-[12px] font-semibold text-emerald-800">Báo giá đã công bố ({versions.length} phiên bản)</summary>
                      <ol className="mt-2 space-y-2 border-t border-emerald-100 pt-2">{[...versions].sort((a, b) => b.version - a.version).map((v) =>
                        <li key={v.id} className="text-[12px] leading-5 text-ink-700">
                          <strong className="text-ink-900">Bản {v.version}: {v.quote_price} {v.quote_currency}/{v.quote_unit}</strong> · {fmtDate(v.published_at)}
                          {v.buyer_note && <p className="whitespace-pre-wrap break-words">Lời nhắn: {v.buyer_note}</p>}
                        </li>)}</ol>
                    </details>}
                    {m.quote_buyer_note && <div className="mt-2 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-[12px] text-ink-800">
                      <strong>Lời nhắn nhà cung cấp gửi người mua{m.status === "quoted" ? " (chờ trình)" : ""}:</strong>
                      <p className="mt-1 whitespace-pre-wrap break-words">{m.quote_buyer_note}</p>
                    </div>}
                    {portalThread.length > 0 && <details className="mt-2 rounded-lg border border-ink-200 bg-ink-50/40 px-3 py-2">
                      <summary className="cursor-pointer text-[12px] font-semibold text-brand-700">{isSourcing ? "Lịch sử trao đổi người mua và nhà cung cấp (chỉ đọc)" : "Trao đổi trực tiếp giữa người mua và nhà cung cấp"} ({portalThread.length})</summary>
                      <ol className="mt-2 space-y-2 border-t border-ink-100 pt-2">{portalThread.map((msg) => <li key={msg.id} className="text-[12px] leading-5 text-ink-700">
                        <span className="font-semibold text-ink-900">{msg.sender === "buyer" ? "Người mua" : "Nhà cung cấp"}</span>
                        <span className="text-ink-500"> · {fmtDate(msg.created_at)}</span>
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                      </li>)}</ol>
                    </details>}

                    {canManageRfq && !isClosed && (
                      <details className="group mt-1.5">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-brand-700 hover:underline">
                          <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                          Quản lý lời mời / trạng thái
                        </summary>
                        <div className="mt-2 space-y-3 rounded-md border border-ink-100 bg-ink-50/50 p-3">
                          <p className="text-[12px] text-ink-600">Báo giá do nhà cung cấp nộp trên cổng. Vexim chỉ xem và công bố, không nhập hoặc sửa giá thay họ.</p>
                          <div className="flex flex-wrap items-end gap-2 border-t border-ink-100 pt-3">
                            {!m.sent_to_buyer_at && <ActionForm action={updateMatchStatusAction} successText="Đã cập nhật trạng thái" className="flex items-end gap-1.5">
                              <input type="hidden" name="match_id" value={m.id} />
                              <input type="hidden" name="rfq_id" value={rfq.id} />
                              <label className="flex flex-col text-[11px] text-ink-500">
                                Cập nhật tay (không gửi email)
                                <select name="status" defaultValue={m.status === "proposed" && !m.sent_to_supplier_at || ["declined", "no_response"].includes(m.status) ? m.status : ""} className="input mt-1 py-1 text-[13px]">
                                  {!(m.status === "proposed" && !m.sent_to_supplier_at || ["declined", "no_response"].includes(m.status)) && <option value="" disabled>{ms.label}</option>}
                                  {MANUAL_MATCH_STATUSES.filter((v) => v === "proposed" ? !m.sent_to_supplier_at : v !== "sent_to_supplier" && !!m.sent_to_supplier_at).map((v) => <option key={v} value={v}>{MATCH_STATUS[v].label}</option>)}
                                </select>
                              </label>
                              <PendingButton>Lưu</PendingButton>
                            </ActionForm>}
                            {!m.sent_to_supplier_at && !m.sent_to_buyer_at && <form action={removeMatchAction} className="ml-auto">
                              <input type="hidden" name="match_id" value={m.id} />
                              <input type="hidden" name="rfq_id" value={rfq.id} />
                              <ConfirmSubmitButton className="text-[12px] text-red-600 hover:underline" message={`Xoá ${name} khỏi RFQ này? Báo giá đã nhập của nhà cung cấp này sẽ mất.`}>
                                Xoá khỏi RFQ
                              </ConfirmSubmitButton>
                            </form>}
                          </div>

                          {thread.length > 0 && (
                            <ul className="space-y-1 border-t border-ink-100 pt-3">
                              {thread.slice(0, 3).map((msg) => (
                                <li key={msg.id} className="flex items-center gap-2 text-[12px]">
                                  {msg.kind === "inbound" ? <Mail className="h-3 w-3 shrink-0 text-sky-700" /> : <Send className="h-3 w-3 shrink-0 text-brand-700" />}
                                  <span className="min-w-0 flex-1 truncate text-ink-700">{msg.subject}</span>
                                  <span className="shrink-0 text-[11px] text-ink-400">{fmtDate(msg.created_at)}</span>
                                </li>
                              ))}
                              {thread.length > 3 && <li className="text-[11px] text-ink-400">… còn {thread.length - 3} thư trong timeline bên dưới.</li>}
                            </ul>
                          )}
                        </div>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>

            {canAct && (
              <ActionForm action={addMatchAction} successText="Đã thêm vào shortlist" className="flex flex-wrap items-center gap-2" wrapperClassName="mt-3 border-t border-ink-100 pt-3">
                <input type="hidden" name="rfq_id" value={rfq.id} />
                <select name="supplier_id" required aria-label="Thêm nhà cung cấp đã duyệt" className="input min-w-0 flex-1 py-1.5 text-[13px] sm:max-w-sm">
                  <option value="">+ Thêm nhà cung cấp đã duyệt…</option>
                  {candidates.map((s) => (
                    <option key={s.id} value={s.id}>{supplierName(s, s.id)}{s.country ? ` (${s.country})` : ""}</option>
                  ))}
                </select>
                <PendingButton>Thêm vào shortlist</PendingButton>
              </ActionForm>
            )}
          </section>

          {isSourcing && <section id="vexim-conversations" className="scroll-mt-20 space-y-4" aria-label="Trao đổi RFQ qua Vexim">
            <div className="card p-4 sm:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-600">Trao đổi qua Vexim</h2>
              <p className="mt-2 text-[13px] leading-5 text-ink-600">Mạch người mua và từng nhà cung cấp tách riêng qua Vexim. Không chuyển tiếp tin của bên này cho bên kia.</p>
              {mediationUnavailable && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">Không tải được toàn bộ trao đổi; tạm khóa gửi tin để tránh nhầm mạch. Thử tải lại trang sau.</p>}
            </div>
            {!mediationUnavailable && <>
              <div className="relative">
                {deskHasNewReply(mediationById.get(rfq.id), "staff") && <Badge className="absolute -right-1 -top-2 z-10 bg-amber-100 text-amber-900">Người mua có tin mới</Badge>}
                <RfqMediatedThread rfqId={rfq.id} side="staff" messages={mediationMessages.get(rfq.id) ?? []}
                  lastVisibleAt={mediationMessages.get(rfq.id)?.at(-1)?.created_at ?? null} canPost={canManageRfq && canUseMediatedDesk(rfq, null)} locale="vi"
                  sendAction={staffVeximMessageAction} markRead={staffVeximReadAction.bind(null, rfq.id, null)} />
              </div>
              {matches.filter((m) => canReadMediatedDesk(rfq, m)).map((m) => <div key={m.id} className="relative">
                <p className="mb-2 text-[13px] font-semibold text-ink-800">Nhà cung cấp: {supplierName(supplierMap.get(m.supplier_id), m.supplier_id)}</p>
                {deskHasNewReply(mediationById.get(m.id), "staff") && <Badge className="absolute -right-1 top-3 z-10 bg-amber-100 text-amber-900">Nhà cung cấp có tin mới</Badge>}
                <RfqMediatedThread rfqId={rfq.id} matchId={m.id} side="staff" messages={mediationMessages.get(m.id) ?? []}
                  lastVisibleAt={mediationMessages.get(m.id)?.at(-1)?.created_at ?? null} canPost={canManageRfq && canUseMediatedDesk(rfq, m)} locale="vi"
                  sendAction={staffVeximMessageAction} markRead={staffVeximReadAction.bind(null, rfq.id, m.id)} />
              </div>)}
            </>}
          </section>}

          {/* Timeline */}
          <MessageTimeline title="Lưu vết thông báo / báo giá qua cổng và email cũ (chỉ đọc)" items={timelineMessages.map((msg) => {
            const sup = msg.rfq_match_id ? supplierMap.get(matches.find((m) => m.id === msg.rfq_match_id)?.supplier_id ?? "") : null;
            return toTimelineItem(msg, sup ? { name: supplierName(sup, sup.id), href: `/crm/suppliers/${sup.id}` } : null);
          })} empty="Chưa có bản ghi thông báo hoặc báo giá trên cổng. Trao đổi mới nằm ở các mạch riêng phía trên." />
        </div>

        {/* CỘT PHỤ */}
        <div className="min-w-0 space-y-5">
          {isSourcing && <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">SLA tìm nguồn</h2>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-500">Phản hồi đầu</dt><dd>{rfq.first_response_at ? fmtDate(rfq.first_response_at) : "chưa"}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Mục tiêu</dt><dd>24h làm việc</dd></div>
            </dl>
          </section>}

          {rfq.spam_flags.length > 0 && (
            <section className={`card p-4 sm:p-5 ${rfq.status === "spam" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}`}>
              <h2 className={"flex items-center gap-1.5 text-sm font-semibold " + (rfq.status === "spam" ? "text-red-700" : "text-amber-800")}>
                <ShieldAlert className="h-4 w-4 shrink-0" /> Dấu hiệu cần kiểm tra
              </h2>
              <p className="mt-1.5 text-[12px] leading-5 text-ink-600">
                Đây là tín hiệu tự động, không có nghĩa người mua là spam. Hãy đối chiếu thông tin trước khi xử lý.
              </p>
              <ul className="mt-3 space-y-2">
                {rfq.spam_flags.map((flag) => {
                  const detail = spamFlagDetail(flag);
                  return (
                    <li key={flag} className="rounded-md border border-ink-100 bg-white/80 px-3 py-2.5">
                      <p className="text-[12.5px] font-semibold text-ink-800">{detail.label}</p>
                      <p className="mt-0.5 text-[11.5px] leading-5 text-ink-600">{detail.description}</p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Ghi chú nội bộ</h2>
            {String(specs.notes_internal ?? "") && (
              <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3 font-mono text-[12px] leading-relaxed text-ink-700">
                {String(specs.notes_internal)}
              </pre>
            )}
            {canManageRfq ? (
              <ActionForm action={addRfqNoteAction} successText="Đã thêm ghi chú" resetOnSuccess className="space-y-2" wrapperClassName="mt-3">
                <input type="hidden" name="rfq_id" value={rfq.id} />
                <textarea name="note" rows={2} required placeholder="Ghi chú chỉ đội ngũ nhìn thấy…" className="input text-[13px]" />
                <div className="flex justify-end"><PendingButton variant="soft">Thêm ghi chú</PendingButton></div>
              </ActionForm>
            ) : !String(specs.notes_internal ?? "") && <p className="mt-3 text-[12.5px] text-ink-500">Chưa có ghi chú.</p>}
          </section>

          <section className="card p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Tệp đính kèm ({attachments.length})</h2>
            {attachments.length > 0 ? (
              <ul className="mt-3 space-y-1 text-[13px]">
                {attachments.map((a) => (
                  <li key={a.id} className="truncate text-ink-700">📎 {a.file_name} <span className="text-[11px] text-ink-400">({Math.round(a.size_bytes / 1024)}KB · {fmtDate(a.created_at)})</span></li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[12.5px] text-ink-500">Chưa có spec sheet, catalogue hay báo giá đính kèm.</p>
            )}
            {canManageRfq && (
              <ActionForm action={uploadRfqAttachmentAction} successText="Đã tải tệp lên" resetOnSuccess className="flex flex-wrap items-center gap-2" wrapperClassName="mt-3">
                <input type="hidden" name="rfq_id" value={rfq.id} />
                <input name="file" type="file" required aria-label="Chọn tệp (tối đa 10MB)" className="min-w-0 flex-1 text-[12.5px]" />
                <PendingButton variant="soft" pendingText="Đang tải lên…">Tải lên</PendingButton>
              </ActionForm>
            )}
          </section>

          {canManageRfq && (
            <section className="card p-4 sm:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Thao tác khác</h2>
              <ActionForm action={updateRfqStatusFormAction} successText="Đã cập nhật trạng thái" className="flex items-end gap-2" wrapperClassName="mt-3">
                <input type="hidden" name="id" value={rfq.id} />
                <label className="flex min-w-0 flex-1 flex-col text-[12px] text-ink-600">
                  Trạng thái hành chính
                  <select name="status" required defaultValue={MANUAL_RFQ_STATUSES.includes(rfq.status) ? rfq.status : ""} className="input mt-1 py-1.5 text-[13px]">
                    {!MANUAL_RFQ_STATUSES.includes(rfq.status) && <option value="" disabled>{statusInfo.label}</option>}
                    {MANUAL_RFQ_STATUSES.map((v) => (
                      <option key={v} value={v}>{isSupplierQuestion && v === "matching" ? "Đã gửi câu hỏi" : STATUS_LABEL[v].label}</option>
                    ))}
                  </select>
                </label>
                <PendingButton variant="soft">Lưu</PendingButton>
              </ActionForm>
              <p className="mt-1.5 text-[11px] leading-4 text-ink-500">
                Công bố báo giá, gửi mẫu và kết thúc chỉ đổi bằng nút nghiệp vụ. Email chỉ báo có thay đổi; không trả lời RFQ qua email.
              </p>

              {!isSupplierQuestion && rfq.status !== "lost" && rfq.status !== "spam" && (
                <details className="mt-4 border-t border-ink-100 pt-3">
                  <summary className="cursor-pointer text-[12.5px] font-medium text-red-700 hover:underline">Đóng RFQ là thất bại…</summary>
                  <form action={markLostAction} className="mt-2 space-y-2">
                    <input type="hidden" name="rfq_id" value={rfq.id} />
                    <select name="lost_reason" required defaultValue="" aria-label="Lý do mất đơn" className="input py-1.5 text-[13px]">
                      <option value="" disabled>— Chọn lý do (bắt buộc) —</option>
                      {LOST_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <textarea name="note" rows={2} placeholder="Ghi chú thêm (không bắt buộc)" className="input text-[13px]" />
                    <ConfirmSubmitButton className="btn btn-danger btn-sm w-full" message="Đóng RFQ là thất bại? Người mua sẽ nhận email thông báo.">
                      Đóng là thất bại
                    </ConfirmSubmitButton>
                  </form>
                </details>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, wide, children }: { icon: React.ReactNode; label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={"flex min-w-0 items-start gap-2" + (wide ? " sm:col-span-2" : "")}>
      <span className="mt-0.5 shrink-0 text-ink-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wider text-ink-400">{label}</dt>
        <dd className="mt-0.5 break-words text-[13.5px] leading-5 text-ink-800">{children}</dd>
      </div>
    </div>
  );
}
