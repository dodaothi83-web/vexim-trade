import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Clock4,
  Copy,
  Globe,
  Inbox,
  Mail,
  MailPlus,
  MapPin,
  Package,
  Phone,
  Send,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Timer,
} from "lucide-react";

import { Breadcrumbs, Badge, Button } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { assignRfqFormAction, updateRfqStatusFormAction } from "../actions";
import {
  addMatchAction,
  removeMatchAction,
  updateMatchQuoteAction,
  updateMatchStatusAction,
} from "./actions";
import {
  presentShortlistAction,
  selectSupplierAction,
  sendRfqToSuppliersAction,
} from "./outreach-actions";
import {
  composeMatchEmailAction,
  markLostAction,
  markSamplingAction,
  sendFollowUpAction,
} from "./compose-action";
import { hasPermission } from "@/lib/auth/permissions";
import { uploadRfqAttachmentAction } from "./upload-action";
import { addRfqNoteAction } from "./note-action";
import type { RfqStatus } from "@/lib/types";
import { SITE_URL } from "@/lib/site";
import { approvedVerificationSteps, VERIFICATION_LABELS } from "@/lib/verification-status";

export const dynamic = "force-dynamic";

const STATUS_FLOW: { value: RfqStatus; label: string; dot: string }[] = [
  { value: "new", label: "Mới tiếp nhận", dot: "bg-slate-400" },
  { value: "needs_review", label: "Cần duyệt", dot: "bg-rose-500" },
  { value: "in_progress", label: "Đang xử lý", dot: "bg-sky-500" },
  { value: "matching", label: "Đang ghép NCC", dot: "bg-amber-500" },
  { value: "quoted", label: "Đã gửi báo giá", dot: "bg-amber-600" },
  { value: "sampling", label: "Đang gửi mẫu", dot: "bg-violet-500" },
  { value: "won", label: "Thành công", dot: "bg-emerald-500" },
  { value: "lost", label: "Thất bại (bắt buộc lý do)", dot: "bg-ink-400" },
  { value: "spam", label: "Cách ly spam", dot: "bg-red-500" },
];

const MATCH_STATUS: { value: string; label: string; dot: string }[] = [
  { value: "proposed", label: "Đề xuất", dot: "bg-slate-400" },
  { value: "sent_to_supplier", label: "Đã gửi cho NCC", dot: "bg-sky-500" },
  { value: "quoted", label: "Đã có báo giá", dot: "bg-emerald-500" },
  { value: "declined", label: "NCC từ chối", dot: "bg-red-500" },
  { value: "no_response", label: "Không phản hồi", dot: "bg-ink-400" },
  { value: "presented_to_buyer", label: "Đã trình buyer", dot: "bg-violet-500" },
  { value: "selected", label: "Buyer chọn", dot: "bg-emerald-600" },
  { value: "not_selected", label: "Không được chọn", dot: "bg-ink-300" },
];

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false });
}

export default async function RfqDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string>>;
}) {
  const session = await requirePagePermission("rfq.view", "/crm/dashboard");
  const canManageRfq = hasPermission(session.role, "rfq.manage");
  const { id } = await params;
  const sp = await searchParams;
  const store = getStore();
  const rfq = await store.getRfq(id);
  if (!rfq) notFound();
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
  const relevant = suppliers.filter((s) => s.status === "published" || matches.some((m) => m.supplier_id === s.id));
  for (let i = 0; i < relevant.length; i += 40) {
    await Promise.all(relevant.slice(i, i + 40).map(async (s) => {
      const reviews = await store.listVerifications(s.id).catch(() => []);
      reviewedSteps.set(s.id, approvedVerificationSteps(reviews));
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
  const candidates = suppliers
    .filter((s) => s.status === "published" && !matchSupplierIds.has(s.id))
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



  const statusLink = `${SITE_URL}/rfq/status/${rfq.access_token}`;
  const isSupplierQuestion = rfq.source_page === "/rfq?intent=question" || rfq.specs?.inquiry_kind === "supplier_question";
  const currentStatus = STATUS_FLOW.find((s) => s.value === rfq.status) ?? STATUS_FLOW[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={[
        { label: "Tổng quan", href: "/crm/dashboard" },
        { label: "RFQ", href: "/crm/rfqs" },
        { label: rfq.code },
      ]} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link href="/crm/rfqs" className="btn btn-ghost btn-sm">
          <ArrowLeft className="h-4 w-4" /> Quay lại hộp thư
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink-900">
          <span className="font-mono">{rfq.code}</span>
          <Badge className="inline-flex items-center gap-1">
            <span className={"h-2 w-2 rounded-full " + currentStatus.dot} />
            {isSupplierQuestion && rfq.status === "matching" ? "Đã gửi câu hỏi" : currentStatus.label}
          </Badge>
          {isSupplierQuestion && <Badge color="#0f766e">Câu hỏi trực tiếp cho NCC</Badge>}
          {rfq.status === "spam" && (
            <Badge color="#b91c1c" className="inline-flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" /> spam score {rfq.spam_score}
            </Badge>
          )}
        </h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a href={statusLink} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            <Copy className="h-3.5 w-3.5" /> Link theo dõi buyer
          </a>
        </div>
      </div>

      {sp?.selection_email === "failed" && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Đã lưu NCC được chọn trên cổng, nhưng email NCC chưa gửi được. Vui lòng liên hệ NCC qua Vexim; đừng chọn lại chỉ để thử gửi vì quyết định không tự gửi trùng.</div>}
      {sp?.selection_email === "sent" && <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Resend đã chấp nhận email báo NCC được chọn; chưa phải xác nhận phát tới hộp thư.</div>}
      {sp?.outreach_sent !== undefined && <div role="status" className={`mt-4 rounded-lg border p-3 text-sm ${Number(sp.outreach_skipped) > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
        Resend chấp nhận {Number(sp.outreach_sent) || 0} lời mời NCC; {Number(sp.outreach_skipped) || 0} yêu cầu chưa gửi (có thể đã gửi trước, thiếu email hoặc gửi thất bại). Kiểm tra trạng thái từng NCC trước khi thử lại.
      </div>}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* LEFT: RFQ + buyer */}
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Yêu cầu</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-[13.5px]">
              <Field icon={<Package className="h-4 w-4" />} label="Sản phẩm">
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
              <Field icon={<MapPin className="h-4 w-4" />} label="Điểm đến">{rfq.destination_country ?? "—"}</Field>
              <Field icon={<Package className="h-4 w-4" />} label="Incoterm">{rfq.incoterm ?? "—"}</Field>
              <Field icon={<CalendarClock className="h-4 w-4" />} label="Cần vào">{rfq.needed_by ?? "—"}</Field>
              <Field icon={<Tag className="h-4 w-4" />} label="Giá mục tiêu">
                {rfq.target_price ? `${rfq.target_price} ${rfq.target_price_currency ?? ""}` : "—"}
              </Field>
              <Field icon={<Timer className="h-4 w-4" />} label="Extras">
                {[
                  rfq.wants_samples && "gửi mẫu",
                  rfq.wants_inspection && "kiểm định",
                  rfq.wants_video_call && "video call",
                ].filter(Boolean).join(", ") || "—"}
              </Field>
              <Field icon={<CalendarClock className="h-4 w-4" />} label="Nhận lúc">{fmtDate(rfq.created_at)}</Field>
              {String((rfq.specs as Record<string, unknown>)?.notes ?? "") && (
                <div className="sm:col-span-2">
                  <dt className="text-[11px] uppercase tracking-wider text-ink-400">{isSupplierQuestion ? "Câu hỏi từ buyer" : "Ghi chú từ buyer"}</dt>
                  <dd className="mt-1 whitespace-pre-line rounded-md bg-ink-50 p-3 text-[13px] text-ink-700">
                    {String((rfq.specs as Record<string, unknown>)?.notes)}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Buyer</h2>
            {buyer ? (
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-[13.5px]">
                <Field icon={<Building2 className="h-4 w-4" />} label="Công ty">{buyer.company}</Field>
                <Field icon={<Mail className="h-4 w-4" />} label="Liên hệ">
                  {buyer.contact_name ?? "—"}
                  {buyer.email && (
                    <a href={`mailto:${buyer.email}`} className="ml-2 text-brand-700 hover:underline">{buyer.email}</a>
                  )}
                </Field>
                <Field icon={<Phone className="h-4 w-4" />} label="Điện thoại">{buyer.phone ?? "—"}</Field>
                <Field icon={<MapPin className="h-4 w-4" />} label="Quốc gia">{buyer.country ?? "—"}</Field>
                <Field icon={<Globe className="h-4 w-4" />} label="Website">
                  {buyer.website ? (
                    <a href={buyer.website.startsWith("http") ? buyer.website : `https://${buyer.website}`}
                       target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{buyer.website}</a>
                  ) : "—"}
                </Field>
                <Field icon={<Tag className="h-4 w-4" />} label="Loại hình">{buyer.business_type ?? "—"}</Field>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-ink-500">Không tìm thấy bản ghi buyer.</p>
            )}
          </section>

          <section className="card">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                Ghép nhà cung cấp ({matches.length})
              </h2>
              <span className="text-[11.5px] text-ink-500">Chọn các NCC phù hợp để gửi báo giá so sánh.</span>
            </div>
            {!canManageRfq && (
              <p className="mt-2 rounded-md bg-ink-50 px-3 py-2 text-[12.5px] text-ink-500">Bạn đang ở chế độ chỉ xem. Các thao tác ghép NCC, gửi email và lưu báo giá chỉ hiển thị cho tài khoản có quyền <code>rfq.manage</code>.</p>
            )}

{preferredSupplierIds.length > 0 && (
              <div className="mt-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-700">
                <strong className="text-brand-900">Buyer chỉ định nhà cung cấp:</strong>{" "}
                {preferredSupplierIds.map((pid) => supplierMap.get(pid)?.display_name ?? supplierMap.get(pid)?.trade_name ?? supplierMap.get(pid)?.name ?? pid).join(", ")}.
                {isSupplierQuestion
                  ? "Buyer chỉ đồng ý chia sẻ câu hỏi và liên hệ với NCC này. Không thêm NCC khác nếu chưa có đồng ý mới."
                  : "RFQ này được gửi từ trang sản phẩm hoặc trang nhà cung cấp, nên hãy ưu tiên gửi yêu cầu báo giá cho các nhà cung cấp này trước khi tìm thêm đơn vị khác."}
              </div>
            )}

{isSupplierQuestion && (
              <p className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-sky-900">
                Câu hỏi này dùng email để NCC phản hồi trực tiếp cho buyer. Vexim giữ bản ghi để kiểm duyệt và hỗ trợ khi giao email gặp lỗi; không dùng các nút báo giá cho bản ghi câu hỏi này.
              </p>
            )}

{canManageRfq && !isSupplierQuestion && (
            <form action={addMatchAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="rfq_id" value={rfq.id} />
              <label className="flex flex-col text-[12px] text-ink-600">
                <span>Thêm NCC đã duyệt</span>
                <select name="supplier_id" required className="input mt-1 min-w-[260px] py-1.5 text-[13px]">
                  <option value="">— Chọn nhà cung cấp —</option>
                  {candidates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.display_name ?? s.trade_name ?? s.name}
                      {s.country ? ` (${s.country})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm">Thêm vào shortlist</Button>
            </form>
            )}

{canManageRfq && !isSupplierQuestion && (
            <form action={sendRfqToSuppliersAction} className="mt-4 rounded-md border border-ink-200 bg-ink-50/50 p-3">
              <input type="hidden" name="rfq_id" value={rfq.id} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] text-ink-600">
                  Chọn các NCC để <strong>gửi email yêu cầu báo giá ẩn danh</strong>. Buyer sẽ được giữ kín.
                </p>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[12px] text-ink-600">
                    Hạn phản hồi
                    <select name="deadline_days" defaultValue="3" className="input ml-1 py-1 text-[12px]">
                      <option value="2">2 ngày</option>
                      <option value="3">3 ngày</option>
                      <option value="5">5 ngày</option>
                      <option value="7">7 ngày</option>
                    </select>
                  </label>
                  <Button type="submit" size="sm" variant="primary">
                    <Mail className="h-3.5 w-3.5" /> Gửi yêu cầu cho NCC đã chọn
                  </Button>
                </div>
              </div>

              <div className="mt-4 divide-y divide-ink-100">
                {matches.length === 0 && (
                  <p className="py-6 text-center text-[13px] text-ink-500">Chưa ghép NCC nào.</p>
                )}
                {matches.map((m) => {
                  const sup = supplierMap.get(m.supplier_id);
                  const ms = MATCH_STATUS.find((x) => x.value === m.status) ?? MATCH_STATUS[0];
                  const canSend = m.status === "proposed" && !m.sent_to_supplier_at;
                  const canFollowUp = m.status === "no_response" || (!!m.sent_to_supplier_at && ["proposed", "sent_to_supplier"].includes(m.status));
                  const canSelect = m.status === "quoted" || m.status === "presented_to_buyer";
                  const thread = messagesByMatch.get(m.id) ?? [];
                  const passed = reviewedSteps.get(m.supplier_id) ?? [];
                  return (
                    <div key={m.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canManageRfq && canSend && (
                          <input
                            type="checkbox"
                            name="match_ids"
                            value={m.id}
                            className="h-4 w-4 rounded border-ink-300 text-brand-600"
                          />
                        )}
                        <Link href={`/crm/suppliers/${m.supplier_id}`} className="text-[14px] font-semibold text-ink-900 hover:text-brand-700">
                          {sup?.display_name ?? sup?.trade_name ?? sup?.name ?? m.supplier_id}
                        </Link>
                        {sup?.email ? (
                          <span className="text-[11.5px] text-ink-500">{sup.email}</span>
                        ) : (
                          <span className="text-[11.5px] text-red-600">chưa có email</span>
                        )}
                        {preferredSupplierIds.includes(m.supplier_id) && (
                          <Badge className="bg-brand-600 text-[10.5px] text-white">Buyer chỉ định</Badge>
                        )}
                        {passed.map((step) => <Badge key={step} color="#059669" className="text-[10.5px]">{VERIFICATION_LABELS[step]}</Badge>)}
                        <Badge className="inline-flex items-center gap-1">
                          <span className={"h-1.5 w-1.5 rounded-full " + ms.dot} />
                          {ms.label}
                        </Badge>
                        {canManageRfq && canSelect && (
                          <form action={selectSupplierAction} className="ml-1">
                            <input type="hidden" name="rfq_id" value={rfq.id} />
                            <input type="hidden" name="match_id" value={m.id} />
                            <button type="submit" className="btn btn-soft btn-sm">Chọn NCC này</button>
                          </form>
                        )}
                        {canManageRfq && canFollowUp && (
                          <form action={sendFollowUpAction}>
                            <input type="hidden" name="rfq_id" value={rfq.id} />
                            <input type="hidden" name="match_id" value={m.id} />
                            <button type="submit" className="btn btn-ghost btn-sm" title="Nhắc NCC sau khi đã gửi quá 3 ngày mà chưa phản hồi">
                              <Clock4 className="h-3.5 w-3.5" /> Nhắc phản hồi
                            </button>
                          </form>
                        )}
{canManageRfq && (<details className="relative ml-1">
                          <summary className="btn btn-ghost btn-sm cursor-pointer list-none">
                            <MailPlus className="h-3.5 w-3.5" /> Soạn email
                          </summary>
                          <form action={composeMatchEmailAction} className="absolute right-0 z-20 mt-1 w-[440px] max-w-[calc(100vw-2rem)] rounded-lg border border-ink-200 bg-white p-3 shadow-lg">
                            <input type="hidden" name="rfq_id" value={rfq.id} />
                            <input type="hidden" name="match_id" value={m.id} />
                            <label className="flex flex-col text-[11px] text-ink-600">
                              Tiêu đề
                              <input name="subject" required className="input mt-1 py-1 text-[13px]" defaultValue={`[Vexim] Về yêu cầu ${rfq.code} – ${rfq.product_text}`} />
                            </label>
                            <label className="mt-2 flex flex-col text-[11px] text-ink-600">
                              Nội dung email (tối đa 2000 từ)
                              <textarea name="body" required rows={6} className="input mt-1 text-[13px]" defaultValue={`Chào ${sup?.contact_name ?? "bạn"},\n\nBên mình đang tìm nguồn ${rfq.product_text} cho đối tác — số lượng ${rfq.quantity ?? "—"} ${rfq.unit ?? ""}, cần hàng vào ${rfq.needed_by ?? "—"}, Incoterm ${rfq.incoterm ?? "FOB"}.\n\nNếu Quý nhà cung cấp quan tâm, vui lòng phản hồi trực tiếp email này với báo giá FOB và lead time.\n\nTrân trọng,\nVexim Trade`} />
                            </label>
                            <p className="mt-1 text-[10.5px] text-ink-400">Reply-To riêng cho từng match (rfq+{rfq.code.toLowerCase()}-m…); thư trả lời sẽ tự gắn vào timeline.</p>
                            <div className="mt-2 flex justify-end gap-2">
                              <button type="reset" className="btn btn-ghost btn-sm">Huỷ</button>
                              <Button type="submit" size="sm">Gửi</Button>
                            </div>
                          </form>
                        </details>)}
                        {canManageRfq && (<form action={removeMatchAction} className="ml-auto">
                          <input type="hidden" name="match_id" value={m.id} />
                          <input type="hidden" name="rfq_id" value={rfq.id} />
                          <button type="submit" className="text-[12px] text-red-600 hover:underline">Xoá</button>
                        </form>)}
                      </div>

                      {/* Thread per-match */}
                      {thread.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {thread.slice(0, 3).map((msg) => (
                            <div key={msg.id} className="flex items-start gap-2 rounded-md bg-ink-50 px-2 py-1.5 text-[12px]">
                              <span className={"mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-brand-700 " + (msg.kind === "inbound" ? "bg-sky-100 text-sky-700" : "bg-brand-100")}>
                                {msg.kind === "inbound" ? <Mail className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-ink-700"><strong>{msg.subject}</strong></div>
                                <div className="text-[11px] text-ink-500">
                                  {msg.kind === "inbound" ? "← nhận được" : "→ đã gửi tới " + msg.to_emails.join(", ")} · {fmtDate(msg.created_at)}
                                </div>
                              </div>
                            </div>
                          ))}
                          {thread.length > 3 && (
                            <p className="text-[11px] text-ink-400">… còn {thread.length - 3} thư, xem đầy đủ trong timeline phía dưới.</p>
                          )}
                        </div>
                      )}

{canManageRfq && (<form action={updateMatchQuoteAction} className="mt-2 grid gap-2 sm:grid-cols-5">
                        <input type="hidden" name="match_id" value={m.id} />
                        <input type="hidden" name="rfq_id" value={rfq.id} />
                        <label className="flex flex-col text-[11px] text-ink-500">
                          Giá
                          <input
                            name="quote_price"
                            type="number"
                            step="0.01"
                            defaultValue={m.quote_price ?? ""}
                            className="input mt-1 py-1 text-[13px]"
                            placeholder="vd 3.20"
                          />
                        </label>
                        <label className="flex flex-col text-[11px] text-ink-500">
                          Tệ
                          <input
                            name="quote_currency"
                            defaultValue={m.quote_currency ?? "USD"}
                            className="input mt-1 py-1 text-[13px]"
                          />
                        </label>
                        <label className="flex flex-col text-[11px] text-ink-500">
                          ĐVT
                          <input
                            name="quote_unit"
                            defaultValue={m.quote_unit ?? rfq.unit ?? ""}
                            className="input mt-1 py-1 text-[13px]"
                          />
                        </label>
                        <label className="flex flex-col text-[11px] text-ink-500">
                          Incoterm
                          <input
                            name="quote_incoterm"
                            defaultValue={m.quote_incoterm ?? rfq.incoterm ?? ""}
                            className="input mt-1 py-1 text-[13px]"
                          />
                        </label>
                        <label className="flex flex-col text-[11px] text-ink-500">
                          Lead time (ngày)
                          <input
                            name="quote_lead_time_days"
                            type="number"
                            defaultValue={m.quote_lead_time_days ?? ""}
                            className="input mt-1 py-1 text-[13px]"
                          />
                        </label>
                        <div className="sm:col-span-5 flex flex-wrap items-end gap-2">
                          <Button type="submit" size="sm">Lưu báo giá</Button>
                          {m.sent_to_supplier_at && (
                            <span className="text-[11.5px] text-ink-400">Đã gửi NCC: {fmtDate(m.sent_to_supplier_at)}</span>
                          )}
                          {m.sent_to_buyer_at && (
                            <span className="text-[11.5px] text-emerald-600">Đã trình buyer: {fmtDate(m.sent_to_buyer_at)}</span>
                          )}
                        </div>
                      </form>)}

                      {canManageRfq && (<form action={updateMatchStatusAction} className="mt-1 flex items-end gap-2">
                        <input type="hidden" name="match_id" value={m.id} />
                        <input type="hidden" name="rfq_id" value={rfq.id} />
                        <label className="flex flex-col text-[11px] text-ink-500">
                          Trạng thái
                          <select
                            name="status"
                            defaultValue={m.status}
                            onChange={(e) => e.currentTarget.form?.requestSubmit()}
                            className="input mt-1 py-1 text-[13px]"
                          >
                            {MATCH_STATUS.filter((s) => s.value !== "selected" || m.status === "selected").map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </label>
                      </form>)}
                    </div>
                  );
                })}
              </div>
            </form>
            )}


{canManageRfq && !isSupplierQuestion && matches.some((m) => m.status === "quoted") && (
              <form action={presentShortlistAction} className="mt-4 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
                <input type="hidden" name="rfq_id" value={rfq.id} />
                <p className="text-[12.5px] text-emerald-800">
                  Có <strong>{matches.filter((m) => m.status === "quoted").length}</strong> báo giá sẵn sàng.
                  Gửi bảng so sánh cho buyer (sẽ ghi nhận thời điểm phản hồi đầu tiên cho SLA).
                </p>
                <Button type="submit" size="sm" variant="primary">
                  <Send className="h-3.5 w-3.5" /> Trình buyer
                </Button>
              </form>
            )}
          </section>

          {/* Timeline */}
          <section className="card">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-500">
              <Inbox className="h-4 w-4" /> Timeline thư từ ({messages.length})
            </h2>
            {messages.length === 0 ? (
              <p className="mt-3 text-[13px] text-ink-500">Chưa có email nào cho RFQ này. Thư gửi NCC / buyer / phản hồi sẽ hiện ở đây.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {messages.map((msg) => {
                  const mid = (msg as unknown as { rfq_match_id?: string | null }).rfq_match_id;
                  const sup = mid ? supplierMap.get(matches.find((m) => m.id === mid)?.supplier_id ?? "") : null;
                  const inbound = msg.kind === "inbound";
                  return (
                    <li key={msg.id} className="rounded-md border border-ink-200 bg-white p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className={"inline-flex h-5 items-center rounded-full px-1.5 text-[10.5px] font-semibold " + (inbound ? "bg-sky-100 text-sky-800" : "bg-brand-100 text-brand-800")}>
                              {inbound ? "← NHẬN" : "→ GỬI"}
                            </span>
                            <strong className="truncate text-ink-800">{msg.subject}</strong>
                          </div>
                          <div className="mt-0.5 text-[11px] text-ink-500">
                            {sup ? <>Nhà cung cấp: <Link href={`/crm/suppliers/${sup.id}`} className="text-brand-700 hover:underline">{sup.display_name ?? sup.trade_name ?? sup.name}</Link> · </> : null}
                            {!mid && <span className="text-violet-700">Luồng buyer · </span>}
                            {inbound ? "thư đến" : "thư đi"} · {fmtDate(msg.created_at)}
                          </div>
                        </div>
                      </div>
                      {(msg.body_text || msg.body_html) && (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[11px] text-ink-500 hover:text-ink-700">Xem nội dung…</summary>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-2 font-mono text-[11.5px] text-ink-700">{msg.body_text ?? "(HTML-only email)"}</pre>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* RIGHT: workflow */}
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Phân công & trạng thái</h2>
            {canManageRfq && (<form action={assignRfqFormAction} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={rfq.id} />
              <label className="flex flex-col text-[12px] text-ink-600">
                Chủ trì
                <select name="to" defaultValue={rfq.assigned_to ?? ""} className="input mt-1 py-1.5 text-[13px]">
                  <option value="">— Chưa phân công —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm">Lưu phân công</Button>
            </form>)}
            {canManageRfq && (<form action={updateRfqStatusFormAction} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={rfq.id} />
              <label className="flex flex-col text-[12px] text-ink-600">
                Trạng thái
                <select name="status" defaultValue={["sampling", "lost"].includes(rfq.status) ? "" : rfq.status} className="input mt-1 py-1.5 text-[13px]" required>
                  <option value="" disabled>— Chọn trạng thái —</option>
                  {STATUS_FLOW.filter((s) => s.value !== "sampling" && s.value !== "lost").map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <span className="mt-1 text-[11px] text-ink-500">Sampling / lost dùng nút Chốt giai đoạn bên dưới để buyer nhận email và lost có lý do.</span>
              </label>
              <Button type="submit" size="sm" variant="soft">Cập nhật trạng thái</Button>
            </form>)}
            {!canManageRfq && <p className="mt-3 text-[12px] text-ink-500">Chỉ xem: không thể phân công hoặc đổi trạng thái RFQ.</p>}
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Chốt giai đoạn</h2>
            {canManageRfq ? (<div className="mt-3 space-y-2">
              <form action={markSamplingAction}>
                <input type="hidden" name="rfq_id" value={rfq.id} />
                <label className="flex flex-col text-[11px] text-ink-500">
                  NCC được chọn (nếu có)
                  <select name="selected_match_id" className="input mt-1 py-1 text-[13px]">
                    <option value="">— chưa chọn —</option>
                    {matches.map((m) => {
                      const sup = supplierMap.get(m.supplier_id);
                      return <option key={m.id} value={m.id}>{sup?.display_name ?? sup?.name ?? m.id}</option>;
                    })}
                  </select>
                </label>
                <Button type="submit" size="sm" variant="soft" className="mt-2 w-full">
                  Đánh dấu đang gửi mẫu
                </Button>
              </form>
              <form action={markLostAction} className="rounded-md border border-red-200 bg-red-50/40 p-2">
                <input type="hidden" name="rfq_id" value={rfq.id} />
                <label className="flex flex-col text-[11px] text-red-800">
                  Đóng mất đơn (bắt buộc lý do)
                  <select name="lost_reason" required defaultValue="" className="input mt-1 py-1 text-[13px]">
                    <option value="" disabled>— chọn lý do —</option>
                    <option value="price">Giá chưa cạnh tranh</option>
                    <option value="lead_time">Không đáp ứng lead time</option>
                    <option value="quality">Chất lượng / chứng chỉ chưa đủ</option>
                    <option value="no_response">NCC không phản hồi</option>
                    <option value="buyer_went_elsewhere">Buyer chọn NCC khác</option>
                    <option value="cancelled">Buyer huỷ yêu cầu</option>
                    <option value="other">Khác</option>
                  </select>
                </label>
                <Button type="submit" size="sm" className="mt-2 w-full bg-red-600 text-white hover:bg-red-700">
                  Đóng là thất bại
                </Button>
              </form>
            </div>) : (
              <p className="mt-3 text-[12.5px] text-ink-500">Bạn cần quyền <code>rfq.manage</code> để chuyển trạng thái sampling / đóng mất đơn.</p>
            )}
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">SLA</h2>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><span className="text-ink-500">Nhận lúc</span><span>{fmtDate(rfq.created_at)}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Phản hồi đầu</span><span>{rfq.first_response_at ? fmtDate(rfq.first_response_at) : "chưa"}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Mục tiêu</span><span>24h làm việc</span></div>
            </dl>
          </section>

          {rfq.spam_flags.length > 0 && (
            <section className="card border-red-200 bg-red-50/40">
              <h2 className="flex items-center gap-1 text-sm font-semibold text-red-700">
                <ShieldAlert className="h-4 w-4" /> Cờ spam
              </h2>
              <ul className="mt-2 list-disc pl-5 text-[12.5px] text-red-800">
                {rfq.spam_flags.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Tệp đính kèm</h2>
            <form action={uploadRfqAttachmentAction} className="mt-3 flex items-end gap-2">
              <input type="hidden" name="rfq_id" value={rfq.id} />
              <label className="flex flex-col text-[12px] text-ink-600">
                Tải lên (tối đa 10MB)
                <input name="file" type="file" className="mt-1 text-[12.5px]" />
              </label>
              <Button type="submit" size="sm" variant="soft">Tải lên</Button>
            </form>
            {attachments.length > 0 ? (
              <ul className="mt-3 space-y-1 text-[13px]">
                {attachments.map((a) => (
                  <li key={a.id} className="text-ink-700">📎 {a.file_name} <span className="text-ink-400 text-[11px]">({Math.round(a.size_bytes/1024)}KB · {fmtDate(a.created_at)})</span></li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[12.5px] text-ink-500">Chưa có tệp đính kèm (spec sheet, catalogue, báo giá NCC...).</p>
            )}
          </section>

          <section className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Ghi chú nội bộ</h2>
            <form action={addRfqNoteAction} className="mt-3 space-y-2">
              <input type="hidden" name="rfq_id" value={rfq.id} />
              <textarea
                name="note"
                rows={3}
                placeholder="Nhập ghi chú nội bộ (chỉ đội ngũ nhìn thấy)..."
                className="input min-h-[80px] text-[13px]"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" variant="soft">Thêm ghi chú</Button>
              </div>
            </form>
            {String((rfq.specs as Record<string, unknown>)?.notes_internal ?? "") && (
              <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3 font-mono text-[12px] leading-relaxed text-ink-700">
                {String((rfq.specs as Record<string, unknown>)?.notes_internal)}
              </pre>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-ink-400">{icon}</span>
      <div>
        <dt className="text-[11px] uppercase tracking-wider text-ink-400">{label}</dt>
        <dd className="text-[13.5px] text-ink-800">{children}</dd>
      </div>
    </div>
  );
}
