import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Anchor,
  Banknote,
  Boxes,
  CalendarClock,
  Clock,
  FileText,
  Globe2,
  MapPin,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  UserRound,
} from "lucide-react";

import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { roleLabel, statusMeta } from "@/lib/supplier";
import { Breadcrumbs, Badge, Card, EmptyState, cx, formatDate, formatMoney } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/stage-select";
import { DeleteSupplierButton } from "@/components/supplier-actions";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = getStore();
  const supplier = await store.getSupplier(id);
  if (!supplier) notFound();

  const [buyers, products] = await Promise.all([
    listBuyersWithSupplier(),
    store.listProductsBySupplier(id),
  ]);
  const attached = buyers.filter((b) => b.supplier_id === id);
  const active = attached.filter((b) => !["completed", "lost"].includes(b.stage));
  const st = statusMeta(supplier.status);

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Nhà cung cấp", href: "/suppliers" }, { label: supplier.name }]}
          />
        }
        title={supplier.name}
        sub={[supplier.trade_name, roleLabel(supplier.role), supplier.province]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Link href={`/suppliers/${id}/edit`} className="btn btn-ghost">
              <Pencil className="h-4 w-4" />
              Sửa
            </Link>
            <DeleteSupplierButton supplierId={id} name={supplier.name} linked={attached.length} />
          </>
        }
      />

      <Card className="mb-5 grid grid-cols-2 divide-ink-200 sm:grid-cols-4 sm:divide-x">
        <Cell label="Trạng thái hồ sơ">
          <Badge className={st.badge}>{st.label}</Badge>
        </Cell>
        <Cell label="Đánh giá">
          <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cx(
                  "h-4 w-4",
                  n <= (supplier.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-ink-200",
                )}
              />
            ))}
          </span>
        </Cell>
        <Cell label="Lead time">
          <span className="font-black">{supplier.lead_time_days ? `${supplier.lead_time_days} ngày` : "—"}</span>
        </Cell>
        <Cell label="Đơn đang chạy">
          <span className="font-black">{active.length}</span>
          <span className="text-[11.5px] text-ink-400"> / {attached.length} tổng</span>
        </Cell>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-[15px] font-bold text-ink-900">Hồ sơ doanh nghiệp</h2>
          </div>
          <ul className="divide-y divide-ink-100">
            <Row icon={<UserRound className="h-3.5 w-3.5" />} label="Người liên hệ" value={[supplier.contact_name, supplier.contact_title].filter(Boolean).join(" · ")} />
            <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={supplier.email} />
            <Row icon={<Phone className="h-3.5 w-3.5" />} label="Điện thoại / Zalo" value={[supplier.phone, supplier.zalo].filter(Boolean).join(" · ")} />
            <Row icon={<Globe2 className="h-3.5 w-3.5" />} label="Website" value={supplier.website} />
            <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Địa chỉ" value={[supplier.address, supplier.province, supplier.country].filter(Boolean).join(", ")} />
            <Row icon={<Anchor className="h-3.5 w-3.5" />} label="Thị trường" value={supplier.markets} />
            <Row icon={<FileText className="h-3.5 w-3.5" />} label="Mã số thuế" value={supplier.tax_id} />
            <Row icon={<Banknote className="h-3.5 w-3.5" />} label="Thanh toán" value={supplier.payment_terms} />
            <Row icon={<Clock className="h-3.5 w-3.5" />} label="Ngành hàng chính" value={supplier.products} />
          </ul>
          {supplier.notes && (
            <div className="border-t border-ink-200 bg-amber-50/50 px-4 py-3">
              <p className="mb-1 text-[11px] font-bold tracking-wide text-amber-700 uppercase">Ghi chú nội bộ</p>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink-700">{supplier.notes}</p>
            </div>
          )}
          {!supplier.email && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
              NCC chưa có email nên <strong>không nhận được</strong> thông báo tiến độ tự động. Hãy bổ
              sung email ở nút “Sửa”.
            </div>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
              <div>
                <h2 className="text-[15px] font-bold text-ink-900">Sản phẩm ({products.length})</h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  Hồ sơ riêng từng dòng sản phẩm — dùng để so khớp với RFQ của buyer.
                </p>
              </div>
              <Link href={`/suppliers/${id}/products/new`} className="btn btn-primary">
                <Plus className="h-4 w-4" />
                Thêm sản phẩm
              </Link>
            </div>
            {products.length === 0 ? (
              <EmptyState
                icon={<Boxes className="h-5 w-5" />}
                title="Chưa có hồ sơ sản phẩm"
                sub="Thêm từng dòng sản phẩm với MOQ, chứng nhận và giá tham khảo để so khớp RFQ."
                action={
                  <Link href={`/suppliers/${id}/products/new`} className="btn btn-primary">
                    Thêm sản phẩm đầu tiên
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {products.map((pr) => (
                  <li key={pr.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${pr.id}/edit`}
                          className="text-[13.5px] font-semibold text-ink-900 hover:text-brand-700"
                        >
                          {pr.name}
                        </Link>
                        <span className="ml-2 align-middle">
                          <Badge className="bg-brand-50 text-brand-700">{pr.category || "Khác"}</Badge>
                        </span>
                        <p className="mt-0.5 text-[12px] text-ink-500">{pr.spec || "—"}</p>
                      </div>
                      <div className="text-right text-[12.5px]">
                        {pr.ref_price !== null ? (
                          <p className="font-bold text-ink-900">
                            {formatMoney(pr.ref_price)} <span className="font-normal text-ink-400">/ {pr.unit || "đv"} · {pr.incoterm ?? ""} {pr.incoterm_place ?? ""}</span>
                          </p>
                        ) : (
                          <p className="text-ink-400">chưa có giá tham khảo</p>
                        )}
                        {pr.price_valid_until && (
                          <p className="text-[11px] text-ink-400">hiệu lực đến {formatDate(pr.price_valid_until)}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {pr.moq && <Badge className="bg-ink-50 text-ink-600">MOQ {pr.moq}</Badge>}
                      {pr.monthly_capacity && <Badge className="bg-ink-50 text-ink-600">{pr.monthly_capacity}</Badge>}
                      {pr.lead_time_days !== null && (
                        <Badge className="bg-ink-50 text-ink-600">
                          <CalendarClock className="h-3 w-3" /> {pr.lead_time_days} ngày
                        </Badge>
                      )}
                      {pr.certifications && <Badge className="bg-emerald-50 text-emerald-700">{pr.certifications}</Badge>}
                      {pr.oem && <Badge className="bg-violet-50 text-violet-700">OEM</Badge>}
                      {pr.samples && <Badge className="bg-sky-50 text-sky-700">gửi mẫu</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
              <div>
                <h2 className="text-[15px] font-bold text-ink-900">Đơn hàng đang giao cho NCC này</h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  Tổng giá trị {formatMoney(attached.reduce((sum, b) => sum + (b.deal_value ?? 0), 0))}
                </p>
              </div>
            </div>
            {attached.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Chưa có đơn nào gắn NCC này"
                sub="Vào trang buyer hoặc pipeline, chọn NCC ở cột “Nhà cung cấp” để gắn."
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {attached.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/buyers/${b.id}`}
                      className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-brand-50/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink-900">
                          {b.hide_buyer_from_supplier ? (
                            <>
                              Khách thị trường {b.country || "nước ngoài"}{" "}
                              <span className="font-normal text-ink-400">(ẩn danh)</span>
                            </>
                          ) : (
                            b.company
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-ink-500">
                          {b.product || "—"} · {b.quantity || "—"}
                        </span>
                      </span>
                      <span className="text-[13px] font-bold text-ink-800">
                        {formatMoney(b.deal_value)}
                      </span>
                      <StageBadge stage={b.stage} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-ink-200 bg-ink-50 px-4 py-2.5 text-[11.5px] text-ink-500">
              <ShieldCheck className="mr-1 inline h-3 w-3" />
              Đơn đánh dấu “ẩn danh” sẽ không tiết lộ tên buyer trong email gửi NCC.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-bold tracking-wide text-ink-500 uppercase">{label}</p>
      <div className="mt-1 text-[13.5px] text-ink-900">{children}</div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5">
      <span className="mt-0.5 shrink-0 text-ink-400">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold tracking-wide text-ink-500 uppercase">
          {label}
        </span>
        <span className="block text-[13px] break-words text-ink-800">
          {value || <span className="text-ink-300">—</span>}
        </span>
      </span>
    </li>
  );
}
