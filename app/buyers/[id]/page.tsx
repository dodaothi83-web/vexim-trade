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
  Search,
  Tag,
} from "lucide-react";

import { getBuyerWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { stageIndex, FUNNEL_STAGES } from "@/lib/pipeline";
import { COMPANY } from "@/lib/config";
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
  const buyer = await getBuyerWithSupplier(id);
  if (!buyer) notFound();

  const store = getStore();
  const [suppliers, activities, emails] = await Promise.all([
    store.listSuppliers(),
    store.listActivities(id),
    store.listMessages(400),
  ]);
  const buyerEmails = emails.filter((e) => e.buyer_id === id && e.status !== "draft").slice(0, 15);

  const supplier = buyer.supplier_id
    ? (suppliers.find((s) => s.id === buyer.supplier_id) ?? null)
    : null;

  const idx = stageIndex(buyer.stage);

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Buyer", href: "/buyers" }, { label: buyer.company }]}
          />
        }
        title={buyer.company}
        sub={[buyer.contact_name, buyer.country, buyer.source].filter(Boolean).join(" · ")}
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
            />
            <Link href={`/templates?buyer=${buyer.id}`} className="btn btn-ghost">
              <Eye className="h-4 w-4" />
              Xem trước email
            </Link>
            <Link href={`/mail/compose?to=${buyer.id}&dir=buyer`} className="btn btn-primary">
              <Mail className="h-4 w-4" />
              Soạn email
            </Link>
            <Link href={`/buyers/${buyer.id}/edit`} className="btn btn-ghost">
              <Pencil className="h-4 w-4" />
              Sửa
            </Link>
            <DeleteBuyerButton buyerId={buyer.id} company={buyer.company} />
          </>
        }
      />

      {/* Dải tóm tắt */}
      <Card className="mb-5 grid grid-cols-2 divide-ink-200 sm:grid-cols-4 sm:divide-x">
        <SummaryCell label="Trạng thái" value={<StageBadge stage={buyer.stage} />} />
        <SummaryCell label="Giá trị đơn" value={<span className="font-black">{formatMoney(buyer.deal_value)}</span>} sub={buyer.incoterm ?? undefined} />
        <SummaryCell label="Giao dự kiến" value={formatDate(buyer.expected_ship_date)} sub={buyer.port ? `Cảng: ${buyer.port}` : undefined} />
        <SummaryCell label="NCC" value={buyer.supplier?.name ?? "Chưa gắn"} sub={buyer.supplier ? buyer.supplier.email ?? "thiếu email" : "chỉ gửi email cho buyer"} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Thông tin đơn hàng */}
          <Card>
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">Đơn hàng</h2>
              <Link href={`/products?buyer=${buyer.id}`} className="btn btn-ghost">
                <Search className="h-3.5 w-3.5" />
                Tìm NCC phù hợp
              </Link>
            </div>
            <dl className="grid grid-cols-2 gap-px bg-ink-100 sm:grid-cols-3">
              <Info label="Mặt hàng" value={buyer.product} />
              <Info label="Số lượng" value={buyer.quantity} />
              <Info label="Giá mục tiêu" value={buyer.target_price} />
              <Info label="Phương thức thanh toán" value={buyer.payment_method} />
              <Info
                label="Điều khoản thanh toán"
                value={buyer.payment_terms}
                className="col-span-2 sm:col-span-2"
              />
              <Info label="Quy cách" value={buyer.spec} className="col-span-2 sm:col-span-3" />
            </dl>
            <div className="grid grid-cols-2 gap-px bg-ink-100 sm:grid-cols-3">
              <Info label="Email" value={buyer.email} icon={<Mail className="h-3 w-3" />} />
              <Info label="Điện thoại" value={buyer.phone} icon={<Phone className="h-3 w-3" />} />
              <Info label="Quốc gia" value={buyer.country} icon={<Globe2 className="h-3 w-3" />} />
              <Info label="Người phụ trách" value={buyer.owner} />
              <Info label="Nguồn" value={buyer.source} />
              <Info label="LinkedIn" value={buyer.linkedin} icon={<Link2 className="h-3 w-3" />} />
              <Info label="Instagram" value={buyer.instagram} icon={<AtSign className="h-3 w-3" />} />
              <Info label="Cập nhật" value={relativeTime(buyer.updated_at)} />
            </div>
            {buyer.notes && (
              <div className="border-t border-ink-200 bg-amber-50/50 px-4 py-3">
                <p className="mb-1 text-[11px] font-bold tracking-wide text-amber-700 uppercase">
                  Ghi chú nội bộ — không gửi ra ngoài
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
              {supplier && (
                <Link
                  href={`/mail/compose?to=${buyer.id}&supplier=${supplier.id}&dir=supplier`}
                  className="btn btn-ghost ml-auto px-2.5 py-1 text-[12px]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Soạn email cho NCC
                </Link>
              )}
            </div>
            <div className="p-4">
              <SupplierPicker
                buyer={buyer}
                suppliers={suppliers.map((s) => ({
                  id: s.id,
                  name: s.name,
                  email: s.email,
                  status: s.status,
                }))}
              />
            </div>
          </Card>

        </div>

        {/* Cột phải */}
        <div className="space-y-5">
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

          {/* Nhật ký */}
          <Card>
            <div className="border-b border-ink-200 px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink-900">Lịch sử &amp; ghi chú</h2>
            </div>
            <NoteBox buyerId={buyer.id} owner={buyer.owner} />
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
              <Link href="/mail" className="text-[12px] font-semibold text-brand-700 hover:underline">
                Xem tất cả
              </Link>
            </div>
            {buyerEmails.length === 0 ? (
              <EmptyState
                icon={<Mail className="h-5 w-5" />}
                title="Chưa gửi email nào"
                sub="Mỗi lần đổi trạng thái, hệ thống sẽ tự gửi email cập nhật tới buyer và NCC (nếu đã gắn)."
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
                      <span>{e.direction === "buyer" ? "→ buyer" : "→ NCC"}</span>
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

function Info({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("bg-white px-4 py-3", className)}>
      <dt className="flex items-center gap-1 text-[11px] font-bold tracking-wide text-ink-500 uppercase">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-[13px] break-words text-ink-800">
        {value || <span className="text-ink-300">—</span>}
      </dd>
    </div>
  );
}
