import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Copy,
  Globe,
  Mail,
  MapPin,
  Package,
  Phone,
  Send,
  ShieldAlert,
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
  sendRfqToSuppliersAction,
  presentShortlistAction,
  selectSupplierAction,
} from "./outreach-actions";
import { uploadRfqAttachmentAction } from "./upload-action";
import { addRfqNoteAction } from "./note-action";
import type { RfqStatus } from "@/lib/types";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const STATUS_FLOW: { value: RfqStatus; label: string; dot: string }[] = [
  { value: "new", label: "Mới tiếp nhận", dot: "bg-slate-400" },
  { value: "qualified", label: "Đã duyệt hợp lệ", dot: "bg-sky-500" },
  { value: "matching", label: "Đang ghép NCC", dot: "bg-amber-500" },
  { value: "quoting", label: "Đang lấy báo giá", dot: "bg-amber-600" },
  { value: "sampling", label: "Đang gửi mẫu", dot: "bg-violet-500" },
  { value: "won", label: "Thành công", dot: "bg-emerald-500" },
  { value: "lost", label: "Thất bại", dot: "bg-ink-400" },
  { value: "spam", label: "Cách ly spam", dot: "bg-red-500" },
  { value: "closed", label: "Đã đóng", dot: "bg-ink-400" },
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
  await requirePagePermission("suppliers.manage", "/crm/dashboard");
  const { id } = await params;
  const sp = await searchParams;
  const store = getStore();
  const rfq = await store.getRfq(id);
  if (!rfq) notFound();
  const [buyer, matches, suppliers, users, attachments, category] = await Promise.all([
    store.getBuyer(rfq.buyer_id).catch(() => null),
    store.listRfqMatches(rfq.id).catch(() => []),
    store.listSuppliers().catch(() => []),
    store.listUsers().catch(() => []),
    store.listRfqAttachments(rfq.id).catch(() => []),
    rfq.category_id ? store.getCategory(rfq.category_id).catch(() => null) : Promise.resolve(null),
  ]);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
  const matchSupplierIds = new Set(matches.map((m) => m.supplier_id));
  const candidates = suppliers
    .filter(
      (s) =>
        s.status === "published" &&
        !matchSupplierIds.has(s.id)
    )
    .slice(0, 50);



  const statusLink = `${SITE_URL}/rfq/status/${rfq.access_token}`;
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
            {currentStatus.label}
          </Badge>
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
                  <dt className="text-[11px] uppercase tracking-wider text-ink-400">Ghi chú từ buyer</dt>
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
              <span className="text-[11.5px] text-ink-500">Chọn 2–4 NCC phù hợp để gửi báo giá so sánh.</span>
            </div>

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
                  const canSend = ["proposed"].includes(m.status);
                  const canSelect = m.status === "quoted" || m.status === "presented_to_buyer";
                  return (
                    <div key={m.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canSend && (
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
                        <Badge className="inline-flex items-center gap-1">
                          <span className={"h-1.5 w-1.5 rounded-full " + ms.dot} />
                          {ms.label}
                        </Badge>
                        {canSelect && (
                          <form action={selectSupplierAction} className="ml-1">
                            <input type="hidden" name="rfq_id" value={rfq.id} />
                            <input type="hidden" name="match_id" value={m.id} />
                            <button type="submit" className="btn btn-soft btn-sm">Chọn NCC này</button>
                          </form>
                        )}
                        <form action={removeMatchAction} className="ml-auto">
                          <input type="hidden" name="match_id" value={m.id} />
                          <input type="hidden" name="rfq_id" value={rfq.id} />
                          <button type="submit" className="text-[12px] text-red-600 hover:underline">Xoá</button>
                        </form>
                      </div>
                      <form action={updateMatchQuoteAction} className="mt-2 grid gap-2 sm:grid-cols-5">
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
                          <form action={updateMatchStatusAction} className="flex items-end gap-2">
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
                                {MATCH_STATUS.map((s) => (
                                  <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                              </select>
                            </label>
                          </form>
                          <Button type="submit" size="sm">Lưu báo giá</Button>
                          {m.sent_to_supplier_at && (
                            <span className="text-[11.5px] text-ink-400">Đã gửi NCC: {fmtDate(m.sent_to_supplier_at)}</span>
                          )}
                          {m.sent_to_buyer_at && (
                            <span className="text-[11.5px] text-emerald-600">Đã trình buyer: {fmtDate(m.sent_to_buyer_at)}</span>
                          )}
                        </div>
                      </form>
                    </div>
                  );
                })}
              </div>
            </form>

            {matches.some((m) => m.status === "quoted") && (
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
        </div>

        {/* RIGHT: workflow */}
        <div className="space-y-6">
          <section className="card">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">Phân công & trạng thái</h2>
            <form action={assignRfqFormAction} className="mt-3 space-y-3">
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
            </form>
            <form action={updateRfqStatusFormAction} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={rfq.id} />
              <label className="flex flex-col text-[12px] text-ink-600">
                Trạng thái
                <select name="status" defaultValue={rfq.status} className="input mt-1 py-1.5 text-[13px]">
                  {STATUS_FLOW.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm" variant="soft">Cập nhật trạng thái</Button>
            </form>
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
