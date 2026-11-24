import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock,
  Check,
  Eye,
  Factory,
  Globe2,
  AtSign,
  Link2,
  Mail,
  Pencil,
  Phone,
  MessageSquareQuote,
  Search,
  Tag,
  UserRound,
} from "lucide-react";

import { getBuyerWithSupplier } from "@/lib/queries";
import { requirePagePermission } from "@/lib/auth/session";
import { ownerScopeOf } from "@/lib/auth/scope";
import { hasPermission } from "@/lib/auth/permissions";
import { getStore } from "@/lib/db";
import { LEAD_RATING_STAFF_NOTE, LeadRatingList, leadRatingSummary } from "@/components/crm/lead-ratings";
import { migrationHint } from "@/lib/db/migration-hints";
import { uniqueRfqSuppliers, rfqOutreachStatusLabel } from "@/lib/rfq/buyer-outreach";
import { stageIndex, FUNNEL_STAGES } from "@/lib/pipeline";
import { COMPANY } from "@/lib/config";
import { buyerOrderSummary } from "@/lib/buyer/request-summary";
import { Breadcrumbs, Card, EmptyState, cx, formatDate, formatMoney, relativeTime } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { StageBadge, StageSelect } from "@/components/stage-select";
import {
  DeleteBuyerButton,
  NoteBox,
  SupplierPicker,
} from "@/components/buyer-detail-actions";

export const dynamic = "force-dynamic";

export default async function BuyerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePagePermission("buyers.view", "/crm/dashboard");
  const canManage = hasPermission(session.role, "buyers.manage");
  const canCreateSupplier = hasPermission(session.role, "suppliers.manage");
  const canSendMail = hasPermission(session.role, "mail.send");
  const canManageTemplates = hasPermission(session.role, "templates.manage");

  const buyer = await getBuyerWithSupplier(id, ownerScopeOf(session));
  if (!buyer) notFound();

  const store = getStore();
  const canViewRfqs = hasPermission(session.role, "rfq.view");
  const [suppliers, activities, emails, outreach, leadRatings] = await Promise.all([
    store.listSuppliers(),
    store.listActivities(id),
    store.listMessages(400),
    canViewRfqs ? store.listBuyerRfqOutreach([buyer.id]) : [],
    canViewRfqs ? store.listRfqLeadRatings({ buyerId: buyer.id }).catch((error) => {
      console.error("[rfq-lead-rating] could not load", migrationHint(error) ?? error);
      return [];
    }) : [],
  ]);
  // RFQ của người mua: dùng cho danh sách RFQ trong khối yêu cầu và mã RFQ của đánh giá lead.
  const buyerRfqs = canViewRfqs ? await store.listRfqs({ buyerId: buyer.id }).catch(() => []) : [];
  const ratedRfqs = leadRatings.length ? buyerRfqs : [];
  const buyerEmails = emails.filter((e) => e.buyer_id === id && e.status !== "draft").slice(0, 15);
  const distinctSuppliers = uniqueRfqSuppliers(outreach);

  const supplier = buyer.supplier_id
    ? (suppliers.find((s) => s.id === buyer.supplier_id) ?? null)
    : null;

  const idx = stageIndex(buyer.stage);

  // "Mặt hàng" cũ có thể là cả lá thư người mua gõ vào form RFQ chung: hiện tên hàng ngắn gọn,
  // nguyên văn lá thư chuyển sang khối "Yêu cầu của người mua". Không sửa dữ liệu đã lưu.
  const { title: productTitle, request: buyerRequest } = buyerOrderSummary(buyer);
  const latestRfq = [...buyerRfqs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  // Nơi nhận: cảng staff đã ghi, không có thì nước nhận hàng người mua chọn trong RFQ gần nhất.
  const destination = buyer.port?.trim() || latestRfq?.destination_country?.trim() || null;
  const payment = [buyer.payment_method, buyer.payment_terms].filter(Boolean).join(" · ") || null;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Buyer", href: "/crm/buyers" }, { label: buyer.company }]}
          />
        }
        title={buyer.company}
        sub={[buyer.contact_name, buyer.country, buyerSourceLabel(buyer.source)].filter(Boolean).join(" · ")}
        actions={
          <>
            <StageSelect
              size="lg"
              target={{
                id: buyer.id,
                company: buyer.company,
                stage: buyer.stage,
                buyerEmail: buyer.email,
                buyerCc: buyer.cc_emails,
                supplierName: buyer.supplier?.name ?? null,
                supplierEmail: buyer.supplier?.email ?? null,
                owner: buyer.owner,
              }}
              className="min-w-[190px]"
              readOnly={!canManage}
            />
            {canManageTemplates && (
              <Link href={`/crm/templates?buyer=${buyer.id}`} className="btn btn-ghost">
                <Eye className="h-4 w-4" />
                Xem trước email
              </Link>
            )}
            {canSendMail && (
              <Link href={`/crm/mail/compose?to=${buyer.id}&dir=buyer`} className="btn btn-primary">
                <Mail className="h-4 w-4" />
                Soạn email
              </Link>
            )}
            {canManage && (
              <>
                <Link href={`/crm/buyers/${buyer.id}/edit`} className="btn btn-ghost">
                  <Pencil className="h-4 w-4" />
                  Sửa
                </Link>
                <DeleteBuyerButton buyerId={buyer.id} company={buyer.company} />
              </>
            )}
          </>
        }
      />

      {/* Dải tóm tắt */}
      <Card className="mb-5 grid grid-cols-2 divide-ink-200 sm:grid-cols-4 sm:divide-x">
        <SummaryCell label="Trạng thái" value={<StageBadge stage={buyer.stage} />} />
        <SummaryCell label="Giá trị đơn" value={<span className="font-mono font-black tabular-nums">{formatMoney(buyer.deal_value)}</span>} sub={buyer.incoterm ?? undefined} />
        <SummaryCell label="Giao dự kiến" value={formatDate(buyer.expected_ship_date)} sub={buyer.port ? `Cảng: ${buyer.port}` : undefined} />
        <SummaryCell
          label="Nhà cung cấp"
          value={buyer.supplier?.name ?? (distinctSuppliers.length
            ? `${distinctSuppliers[0].supplier_name}${distinctSuppliers.length > 1 ? ` +${distinctSuppliers.length - 1}` : ""}`
            : "Chưa có nhà cung cấp liên quan")}
          sub={buyer.supplier ? "Gắn trong CRM" : distinctSuppliers.length
            ? "Đã gửi RFQ · chưa gắn trong CRM"
            : "Chưa gắn trong CRM hoặc gửi RFQ"}
        />
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Yêu cầu mua hàng: tên hàng nổi bật, thông số dạng ô, nguyên văn yêu cầu tách riêng. */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">Đơn hàng</h2>
              <Link href={`/crm/products?buyer=${buyer.id}`} className="btn btn-ghost">
                <Search className="h-3.5 w-3.5" />
                Tìm nhà cung cấp phù hợp
              </Link>
            </div>
            <div className="px-4 pt-4 pb-3">
              <p className="text-[11px] font-bold tracking-wide text-ink-500 uppercase">Mặt hàng</p>
              <p className="mt-1 text-[17px] leading-6 font-bold break-words text-ink-900" title={buyer.product ?? undefined}>
                {productTitle || <span className="font-medium text-ink-400">Người mua chưa ghi mặt hàng</span>}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-px border-y border-ink-100 bg-ink-100 sm:grid-cols-4">
              <Fact label="Số lượng" value={buyer.quantity} />
              <Fact label="Giá mục tiêu" value={buyer.target_price} />
              <Fact label="Điều kiện giao" value={buyer.incoterm} />
              <Fact label="Nơi nhận hàng" value={destination} />
              <Fact label="Thanh toán" value={payment} className="col-span-2 sm:col-span-4" />
            </dl>
            <div className="px-4 py-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-ink-500 uppercase">
                <MessageSquareQuote className="h-3.5 w-3.5" aria-hidden="true" />
                Quy cách / yêu cầu
              </p>
              {buyerRequest ? (
                <blockquote className="mt-2 space-y-2 rounded-lg border-l-4 border-brand-300 bg-ink-50 px-4 py-3 text-[13px] leading-6 break-words text-ink-800">
                  {/* Đoạn cách nhau bằng dòng trống thành từng khối, khỏi khoảng trắng dài; giữ xuống dòng trong đoạn. */}
                  {buyerRequest.split(/\n\s*\n/).map((part, i) => (
                    <p key={i} className="whitespace-pre-wrap">{part.trim()}</p>
                  ))}
                </blockquote>
              ) : (
                <p className="mt-1 text-[13px] text-ink-400">Người mua chưa ghi quy cách hay yêu cầu thêm.</p>
              )}
            </div>
            {buyerRfqs.length > 0 && (
              <div className="border-t border-ink-200 px-4 py-3">
                <p className="text-[11px] font-bold tracking-wide text-ink-500 uppercase">RFQ của người mua</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {[...buyerRfqs].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => (
                    <li key={r.id}>
                      <Link href={`/crm/rfqs/${r.id}`} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-2.5 py-1.5 text-[12px] hover:border-brand-300 hover:bg-brand-50">
                        <span className="font-mono font-semibold text-brand-700">{r.code}</span>
                        <span className="text-ink-500">{formatDate(r.created_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {buyer.notes && (
              <div className="border-t border-ink-200 bg-amber-50/50 px-4 py-3">
                <p className="mb-1 text-[11px] font-bold tracking-wide text-amber-700 uppercase">
                  Ghi chú nội bộ, không gửi ra ngoài
                </p>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink-700">
                  {buyer.notes}
                </p>
              </div>
            )}
            {buyer.next_action && (
              <div className="flex items-start gap-2 border-t border-ink-200 px-4 py-3">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <div>
                  <p className="text-[11px] font-bold tracking-wide text-ink-500 uppercase">
                    Việc tiếp theo
                  </p>
                  <p className="text-[13px] text-ink-800">{buyer.next_action}</p>
                  {buyer.next_action_date && (
                    <p className="text-[11.5px] text-ink-500">
                      Hạn: {formatDate(buyer.next_action_date)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Nhà cung cấp */}
          <Card>
            <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
              <Factory className="h-4 w-4 text-brand-700" />
              <h2 className="text-[15px] font-bold text-ink-900">Nhà cung cấp</h2>
              {supplier && canSendMail && (
                <Link
                  href={`/crm/mail/compose?to=${buyer.id}&supplier=${supplier.id}&dir=supplier`}
                  className="btn btn-ghost ml-auto px-2.5 py-1 text-[12px]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Soạn email cho nhà cung cấp
                </Link>
              )}
            </div>
            <div className="p-4">
              <SupplierPicker
                buyer={buyer}
                canManage={canManage}
                canCreateSupplier={canCreateSupplier}
                suppliers={suppliers.map((s) => ({
                  id: s.id,
                  name: s.name,
                  email: s.email,
                  status: s.status,
                }))}
              />
              {outreach.length > 0 && (
                <div className="mt-4 border-t border-ink-200 pt-4">
                  <h3 className="text-[13px] font-semibold text-ink-900">Nhà cung cấp đã được gửi RFQ</h3>
                  <p className="mt-1 text-[11.5px] text-ink-500">
                    Đây là lịch sử gửi RFQ, không tự gắn nhà cung cấp vào đơn trong CRM.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {outreach.map((item) => (
                      <li key={`${item.rfq_id}-${item.supplier_id}`} className="rounded-lg border border-ink-200 p-3">
                        <Link href={`/crm/suppliers/${item.supplier_id}`} className="text-[13px] font-semibold text-brand-700 hover:underline">
                          {item.supplier_name}
                        </Link>
                        <p className="mt-1 text-[11.5px] text-ink-500">
                          <Link href={`/crm/rfqs/${item.rfq_id}`} className="font-mono text-brand-700 hover:underline">
                            {item.rfq_code}
                          </Link>
                          {` · ${rfqOutreachStatusLabel(item.status)} · ${formatDate(item.sent_to_supplier_at)}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

        </div>

        {/* Cột phải */}
        <div className="space-y-5">
          {/* Liên hệ người mua: bấm để gửi email / gọi; mạng xã hội chỉ hiện khi có. */}
          <Card>
            <div className="flex items-center gap-3 border-b border-ink-200 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <UserRound className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-bold text-ink-900">{buyer.contact_name || "Người mua"}</h2>
                <p className="truncate text-[12px] text-ink-500">{buyer.company}</p>
              </div>
            </div>
            <dl className="divide-y divide-ink-100">
              <ContactRow icon={<Mail className="h-3.5 w-3.5" />} label="Email"
                value={buyer.email ? <a href={`mailto:${buyer.email}`} className="text-brand-700 hover:underline">{buyer.email}</a> : null} />
              <ContactRow icon={<Phone className="h-3.5 w-3.5" />} label="Điện thoại"
                value={buyer.phone ? <a href={`tel:${buyer.phone.replace(/[^\d+]/g, "")}`} className="text-brand-700 hover:underline">{buyer.phone}</a> : null} />
              <ContactRow icon={<Globe2 className="h-3.5 w-3.5" />} label="Quốc gia" value={buyer.country} />
              <ContactRow icon={<UserRound className="h-3.5 w-3.5" />} label="Người phụ trách"
                value={buyer.owner} empty={<span className="font-semibold text-amber-700">Chưa phân công</span>} />
              <ContactRow icon={<Tag className="h-3.5 w-3.5" />} label="Nguồn" value={buyerSourceLabel(buyer.source)} />
              {buyer.linkedin && <ContactRow icon={<Link2 className="h-3.5 w-3.5" />} label="LinkedIn" value={buyer.linkedin} />}
              {buyer.instagram && <ContactRow icon={<AtSign className="h-3.5 w-3.5" />} label="Instagram" value={buyer.instagram} />}
              <ContactRow icon={<CalendarClock className="h-3.5 w-3.5" />} label="Cập nhật" value={relativeTime(buyer.updated_at)} />
            </dl>
          </Card>

          {/* Tiến độ */}
          <Card>
            <div className="border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">Tiến độ</h2>
            </div>
            <ol className="p-3">
              {FUNNEL_STAGES.map((s, i) => {
                const done = i < idx && buyer.stage !== "lost";
                const active = i === idx && buyer.stage !== "lost";
                return (
                  <li key={s.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cx(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          active && "text-white",
                          done && "bg-brand-100 text-brand-700",
                          !active && !done && "bg-ink-100 text-ink-400",
                        )}
                        style={active ? { backgroundColor: s.color } : undefined}
                      >
                        {done ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      {i < FUNNEL_STAGES.length - 1 && (
                        <span
                          className={cx("my-0.5 w-px flex-1", done ? "bg-brand-200" : "bg-ink-200")}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pb-3">
                      <p
                        className={cx(
                          "text-[12.5px] leading-tight",
                          active ? "font-bold text-ink-900" : done ? "text-ink-700" : "text-ink-400",
                        )}
                      >
                        {s.label}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-ink-400">{s.hint}</p>
                    </div>
                  </li>
                );
              })}
              {buyer.stage === "lost" && (
                <li className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
                  Đơn đang ở trạng thái “Mất đơn / Hoãn” — không gửi email tự động.
                </li>
              )}
            </ol>
          </Card>

          {leadRatings.length > 0 && <Card>
            <div className="border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">Đánh giá lead từ nhà cung cấp</h2>
              <p className="mt-1 text-[12.5px] font-semibold text-ink-800">{leadRatingSummary(leadRatings)}</p>
              <p className="mt-1 text-[12px] leading-5 text-ink-600">{LEAD_RATING_STAFF_NOTE}</p>
            </div>
            <div className="max-h-[380px] overflow-y-auto p-3">
              <LeadRatingList ratings={leadRatings}
                supplierNames={new Map(suppliers.map((s) => [s.id, s.display_name ?? s.trade_name ?? s.name]))}
                rfqCodes={new Map(ratedRfqs.map((r) => [r.id, r.code]))} />
            </div>
          </Card>}

          {/* Nhật ký */}
          <Card>
            <div className="border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">Lịch sử &amp; ghi chú</h2>
            </div>
            <NoteBox buyerId={buyer.id} owner={buyer.owner} canManage={canManage} />
            {activities.length === 0 ? (
              <EmptyState icon={<Tag className="h-5 w-5" />} title="Chưa có hoạt động" />
            ) : (
              <ul className="max-h-[380px] divide-y divide-ink-100 overflow-y-auto">
                {activities.map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <p className="text-[12.5px] leading-snug text-ink-800">{a.message}</p>
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      {relativeTime(a.created_at)}
                      {a.created_by ? ` · ${a.created_by}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Email đã gửi */}
          <Card>
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">Email đã gửi</h2>
              <Link href="/crm/mail" className="text-[12px] font-semibold text-brand-700 hover:underline">
                Xem tất cả
              </Link>
            </div>
            {buyerEmails.length === 0 ? (
              <EmptyState
                icon={<Mail className="h-5 w-5" />}
                title="Chưa gửi email nào"
                sub="Mỗi lần đổi trạng thái, hệ thống sẽ tự gửi email cập nhật tới người mua và nhà cung cấp (nếu đã gắn)."
              />
            ) : (
              <ul className="max-h-[380px] divide-y divide-ink-100 overflow-y-auto">
                {buyerEmails.map((e) => (
                  <li key={e.id} className="px-4 py-2.5">
                    <p className="truncate text-[12.5px] font-medium text-ink-800">{e.subject}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
                      <span
                        className={cx(
                          "rounded px-1.5 py-px font-semibold",
                          e.status === "sent"
                            ? "bg-emerald-50 text-emerald-700"
                            : e.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700",
                        )}
                      >
                        {e.status === "sent" ? "đã gửi" : e.status === "failed" ? "lỗi" : "demo"}
                      </span>
                      <span>{e.direction === "buyer" ? "→ người mua" : "→ nhà cung cấp"}</span>
                      <span>· {relativeTime(e.created_at)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <p className="mt-6 text-center text-[11.5px] text-ink-400">
        Email tự động gửi từ {COMPANY.email} · {COMPANY.website}
      </p>
    </>
  );
}

function SummaryCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-bold tracking-wide text-ink-500 uppercase">{label}</p>
      <div className="mt-1 text-[13.5px] text-ink-900">{value}</div>
      {sub && <p className="mt-0.5 truncate text-[11px] text-ink-400">{sub}</p>}
    </div>
  );
}

/** Một ô thông số đơn hàng: nhãn nhỏ, giá trị rõ; chưa có thì ghi chữ mờ thay vì gạch ngang. */
function Fact({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={cx("bg-white px-4 py-3", className)}>
      <dt className="text-[11px] font-bold tracking-wide text-ink-500 uppercase">{label}</dt>
      <dd className={cx("mt-0.5 text-[13.5px] break-words", value ? "font-semibold text-ink-900" : "text-ink-400")}>
        {value || "Chưa có"}
      </dd>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  empty,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  empty?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <dt className="flex w-32 shrink-0 items-center gap-1.5 text-[12px] text-ink-500">
        <span className="text-ink-400" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-[13px] break-words text-ink-800">
        {value || empty || <span className="text-ink-400">Chưa có</span>}
      </dd>
    </div>
  );
}

/** Nguồn người mua: đường dẫn kỹ thuật ("/rfq") đổi thành tên dễ hiểu, giữ nguyên giá trị lạ. */
function buyerSourceLabel(source: string | null): string | null {
  if (!source) return null;
  if (source === "/rfq" || source === "rfq_form") return "Form yêu cầu báo giá";
  if (source === "/sourcing" || source === "sourcing_request") return "Form tìm nguồn hàng";
  if (source.startsWith("/products/")) return "Trang sản phẩm";
  if (source.startsWith("/suppliers/")) return "Trang nhà cung cấp";
  return source;
}
