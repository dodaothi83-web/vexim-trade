import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Anchor,
  Banknote,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Globe2,
  Eye,
  MapPin,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Star,
  UserRound,
  Users,
} from "lucide-react";

import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { roleLabel, supplierTypeLabel, statusMeta } from "@/lib/supplier";
import { CRM_PRODUCTS_PAGE_SIZE, orderCrmProducts, paginateCrmProducts } from "@/lib/crm/product-list";
import { MediaGallery, MediaThumb } from "@/components/media-gallery";
import { Breadcrumbs, Badge, Card, EmptyState, cx, formatDate, formatMoney } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/stage-select";
import { DeleteSupplierButton, SupplierPublicationControls } from "@/components/supplier-actions";
import { VerificationCoverSeal, VerificationPips, VerificationTierBadge } from "@/components/verification-tier";
import { VerificationPanel } from "./verification-panel";
import { OnboardingControls } from "./onboarding-controls";
import { SupplierAccountControls } from "./account-controls";

export const dynamic = "force-dynamic";

const RFQ_MATCH_LABELS: Record<string, string> = {
  proposed: "Đã khớp, chờ gửi",
  sent_to_supplier: "Đã gửi cho NCC",
  quoted: "Đã có báo giá",
  declined: "NCC từ chối",
  no_response: "Không phản hồi",
  presented_to_buyer: "Đã trình buyer",
  selected: "Buyer chọn",
  not_selected: "Không được chọn",
};

function SectionHead({ icon: Icon, title, sub, action }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span>
          <h2 className="text-base font-bold leading-6 text-ink-900">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] leading-5 text-ink-500">{sub}</p>}
        </span>
      </div>
      {action}
    </div>
  );
}

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ slug: id }, sp] = await Promise.all([params, searchParams]);
  const requestedPage = Number(sp.page ?? "1");
  const session = await requireSession();
  const canManage = hasPermission(session.role, "suppliers.manage");
  const canPublish = hasPermission(session.role, "suppliers.publish");
  const canManageProducts = hasPermission(session.role, "products.manage");
  const canSeeInternal = hasPermission(session.role, "media.internal");
  const canInspect = hasPermission(session.role, "verifications.inspect");
  const canViewReviews = hasPermission(session.role, "verifications.view");
  const canSeeBuyers = hasPermission(session.role, "buyers.view");
  const canSeeRfqs = hasPermission(session.role, "rfq.view");

  const store = getStore();
  const supplier = await store.getSupplier(id);
  if (!supplier) notFound();

  const [buyers, products] = await Promise.all([
    canSeeBuyers ? listBuyersWithSupplier() : Promise.resolve([]),
    store.listProductsBySupplier(id),
  ]);
  const [supplierMedia, productMedia, verifications, requests] = await Promise.all([
    store.listMedia("supplier", id),
    store.listMediaForProducts(products.map((p) => p.id)),
    store.listVerifications(id),
    store.listSupplierVerificationRequests(id).catch((error) => { console.error("[supplier-requests] migration/query failed", error); return []; }),
  ]);
  // Ảnh đại diện cho từng sản phẩm (ưu tiên ảnh chia sẻ buyer, chưa hết hạn)
  const thumbByProduct = new Map<string, typeof productMedia[number]>();
  for (const m of productMedia) {
    if (!m.product_id || m.kind !== "image" || m.audience !== "buyer") continue;
    if (!thumbByProduct.has(m.product_id)) thumbByProduct.set(m.product_id, m);
  }
  const accountUser = await store.getUserBySupplierId(id).catch((error) => {
    console.error("[supplier-account] cannot read linked account", error);
    return null;
  });
  const rfqMatches = canSeeRfqs
    ? await store.listRfqMatchesBySupplier(id).catch((error) => {
        console.error("[supplier-rfqs] cannot list matches", error);
        return [];
      })
    : [];
  const rfqRows = (await Promise.all(
    rfqMatches.slice(0, 8).map(async (match) => {
      const rfq = await store.getRfq(match.rfq_id).catch(() => null);
      return rfq ? { match, rfq } : null;
    }),
  )).filter((row): row is { match: (typeof rfqMatches)[number]; rfq: NonNullable<Awaited<ReturnType<typeof store.getRfq>>> } => row !== null);
  const buyerById = new Map(buyers.map((b) => [b.id, b]));
  const attached = buyers.filter((b) => b.supplier_id === id);
  const active = attached.filter((b) => !["completed", "lost"].includes(b.stage));
  const st = statusMeta(supplier.status);
  const approvedLevels = verifications.filter((v) => v.status === "approved").map((v) => v.target_level);
  const displayName = supplier.display_name || supplier.name;
  // profile_image/cover_image lưu đường dẫn trong kho tệp, phải chuyển thành URL công khai mới hiển thị được.
  const supplierImageUrl = (path: string) => (path.startsWith("http") ? path : `/public-media/${path.replace(/^\//, "")}`);
  const coverUrl = supplier.cover_image ? supplierImageUrl(supplier.cover_image) : null;
  const avatarUrl = supplier.profile_image ? supplierImageUrl(supplier.profile_image) : null;
  const typeLabel = supplier.onboarding_status === "not_started" ? "Chưa khai loại hình" : supplier.supplier_type ? supplierTypeLabel(supplier.supplier_type) : roleLabel(supplier.role);
  const showOnboarding = supplier.onboarding_status === "pending" || supplier.onboarding_status === "changes_requested" || supplier.onboarding_status === "approved";
  const orderedProducts = orderCrmProducts(products);
  const {
    visibleRows: visibleProducts,
    currentPage: productPage,
    pageCount: productPageCount,
    firstRow: firstProduct,
    lastRow: lastProduct,
  } = paginateCrmProducts(orderedProducts, requestedPage);
  const productPageHref = (nextPage: number) =>
    `${nextPage > 1 ? `/crm/suppliers/${id}?page=${nextPage}` : `/crm/suppliers/${id}`}#supplier-products`;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Nhà cung cấp", href: "/crm/suppliers" }, { label: supplier.name }]}
          />
        }
        title={supplier.name}
        sub={[supplier.trade_name, typeLabel, supplier.province]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {canPublish && <SupplierPublicationControls supplierId={id} status={supplier.status} />}
            {canManage && (
              <>
                <Link href={`/crm/suppliers/${id}/edit`} className="btn btn-ghost">
                  <Pencil className="h-4 w-4" />
                  Sửa
                </Link>
                {hasPermission(session.role, "suppliers.delete") && (
                  <DeleteSupplierButton supplierId={id} name={supplier.name} linked={attached.length} />
                )}
              </>
            )}
          </>
        }
      />

      <section className="card mb-4 overflow-hidden" aria-label="Tổng quan nhà cung cấp">
        <div className="relative h-32 bg-gradient-to-r from-ink-900 via-brand-800 to-brand-700 sm:h-40">
          {coverUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-ink-900/50 to-transparent" />
            </>
          )}
          <span className={"absolute left-5 top-5 rounded-full px-3 py-1 text-xs font-semibold " + st.badge}>{st.label}</span>
          <VerificationCoverSeal levels={approvedLevels} />
        </div>
        <div className="relative px-5 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="-mt-9 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-brand-600 text-3xl font-black text-white shadow-sm sm:-mt-11 sm:h-24 sm:w-24">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 lg:pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-xl font-black tracking-tight text-ink-900 sm:text-2xl">{displayName}</h2>
                <VerificationTierBadge levels={approvedLevels} />
                <VerificationPips levels={approvedLevels} compact />
              </div>
              <p className="mt-1 text-sm text-ink-600">
                {[supplier.trade_name, typeLabel, supplier.province, supplier.founded_year ? `Thành lập ${supplier.founded_year}` : null, typeof supplier.employees === "number" && supplier.employees > 0 ? `${supplier.employees} nhân viên` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
                {supplier.phone && (
                  <a href={`tel:${supplier.phone}`} className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 font-medium text-ink-700 ring-1 ring-ink-200 transition hover:bg-brand-50 hover:text-brand-800">
                    <Phone className="h-3.5 w-3.5" /> {supplier.phone}
                  </a>
                )}
                {supplier.email && (
                  <a href={`mailto:${supplier.email}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 font-medium text-ink-700 ring-1 ring-ink-200 transition hover:bg-brand-50 hover:text-brand-800">
                    <Mail className="h-3.5 w-3.5" /> <span className="truncate">{supplier.email}</span>
                  </a>
                )}
                {supplier.zalo && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 font-medium text-ink-700 ring-1 ring-ink-200">
                    <MessageCircle className="h-3.5 w-3.5" /> Zalo {supplier.zalo}
                  </span>
                )}
                {supplier.website && (
                  <a href={supplier.website.startsWith("http") ? supplier.website : `https://${supplier.website}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-ink-50 px-3 py-1.5 font-medium text-ink-700 ring-1 ring-ink-200 transition hover:bg-brand-50 hover:text-brand-800">
                    <Globe2 className="h-3.5 w-3.5" /> <span className="truncate">{supplier.website}</span>
                  </a>
                )}
              </div>
            </div>
            <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 lg:pt-3">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Sản phẩm</dt>
                <dd className="mt-0.5 text-lg font-black leading-6 text-ink-900">{products.length}</dd>
              </div>
              {canSeeBuyers && (
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Đơn đang chạy</dt>
                  <dd className="mt-0.5 text-lg font-black leading-6 text-ink-900">{active.length}<span className="text-xs font-semibold text-ink-400"> / {attached.length} tổng</span></dd>
                </div>
              )}
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Lead time</dt>
                <dd className="mt-0.5 text-lg font-black leading-6 text-ink-900">{supplier.lead_time_days ? `${supplier.lead_time_days} ngày` : "Chưa khai"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Đánh giá</dt>
                <dd className="mt-1 flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cx(
                        "h-4 w-4",
                        n <= (supplier.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-ink-200",
                      )}
                    />
                  ))}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {canViewReviews && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
          <p className="text-ink-700">
            <Link href={`/crm/suppliers/${id}/audit/documents`} className="font-bold text-brand-800 underline">Kiểm tra giấy tờ L1 & chứng nhận AI quét</Link>
            <span className="mt-0.5 block text-[13px] text-ink-600 sm:inline sm:before:content-['·_']">AI tự quét đơn vị đứng tên (chính chủ / đối tác) và ngày hết hạn của chứng nhận L1; tự nhắc NCC trước 60 / 30 / 7 / 1 ngày.</span>
          </p>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <VerificationPanel
            supplierId={id}
            verifications={verifications}
            requests={requests}
            canInspect={canInspect}
            canViewReviews={canViewReviews}
          />

          <section id="supplier-products" className="card scroll-mt-24 p-5">
            <SectionHead
              icon={Boxes}
              title={`Sản phẩm (${products.length})`}
              sub="Chỉ hiển thị thông tin cơ bản. Chọn Xem hoặc Sửa để mở toàn bộ hồ sơ."
              action={canManageProducts ? (
                <Link href={`/crm/suppliers/${id}/products/new`} className="btn btn-primary">
                  <Plus className="h-4 w-4" />
                  Thêm sản phẩm
                </Link>
              ) : undefined}
            />
            {products.length === 0 ? (
              <EmptyState
                icon={<Boxes className="h-5 w-5" />}
                title="Chưa có hồ sơ sản phẩm"
                sub="Thêm hồ sơ sản phẩm để bắt đầu so khớp RFQ."
                action={
                  canManageProducts ? (
                    <Link href={`/crm/suppliers/${id}/products/new`} className="btn btn-primary">
                      Thêm sản phẩm đầu tiên
                    </Link>
                  ) : null
                }
              />
            ) : (
              <>
                <ul className="divide-y divide-ink-100">
                  {visibleProducts.map((pr) => (
                    <li key={pr.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="flex min-w-[190px] flex-1 items-center gap-3">
                        <MediaThumb asset={thumbByProduct.get(pr.id) ?? null} size="h-12 w-12" />
                        <div className="min-w-0">
                          <Link
                            href={`/crm/products/${pr.id}`}
                            title={pr.name}
                            className="block truncate text-[14px] font-bold text-ink-900 hover:text-brand-700 hover:underline"
                          >
                            {pr.name}
                          </Link>
                          <p className="mt-0.5 truncate text-[12px] text-ink-500">{pr.category || "Khác"}</p>
                        </div>
                      </div>
                      <div className="ml-auto flex flex-wrap items-center gap-2">
                        {pr.supplier_review_status === "pending" ? (
                          <Badge className="bg-amber-100 text-amber-900">Chờ Vexim kiểm tra</Badge>
                        ) : pr.supplier_review_status === "changes_requested" ? (
                          <Badge className="bg-orange-50 text-orange-800">Cần NCC sửa</Badge>
                        ) : pr.ready_for_buyer ? (
                          <Badge className="bg-emerald-50 text-emerald-700">Sẵn sàng gửi buyer</Badge>
                        ) : null}
                        <Link href={`/crm/products/${pr.id}`} className="btn btn-ghost px-2.5 py-1.5 text-[12px]">
                          <Eye className="h-3.5 w-3.5" /> Xem
                        </Link>
                        {canManageProducts && (
                          <Link href={`/crm/products/${pr.id}/edit`} className="btn btn-soft px-2.5 py-1.5 text-[12px]">
                            <Pencil className="h-3.5 w-3.5" /> Sửa
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
                  <p className="text-[11.5px] text-ink-500">Hiển thị {firstProduct}-{lastProduct} trong {products.length} sản phẩm. Mỗi trang tối đa {CRM_PRODUCTS_PAGE_SIZE} sản phẩm.</p>
                  {productPageCount > 1 && <nav aria-label="Phân trang sản phẩm của NCC" className="flex items-center gap-2">
                    {productPage > 1 && <Link href={productPageHref(productPage - 1)} className="btn btn-ghost px-2.5 py-1.5" aria-label="Trang sản phẩm trước">
                      <ChevronLeft className="h-4 w-4" /> Trước
                    </Link>}
                    <span className="min-w-[84px] text-center text-[12px] text-ink-600" aria-current="page">Trang {productPage} / {productPageCount}</span>
                    {productPage < productPageCount && <Link href={productPageHref(productPage + 1)} className="btn btn-ghost px-2.5 py-1.5" aria-label="Trang sản phẩm sau">
                      Sau <ChevronRight className="h-4 w-4" />
                    </Link>}
                  </nav>}
                </div>
              </>
            )}
          </section>

          {canSeeBuyers && (
            <Card className="p-5">
              <SectionHead
                icon={Users}
                title="Đơn hàng đang giao cho NCC này"
                sub={`Tổng giá trị ${formatMoney(attached.reduce((sum, b) => sum + (b.deal_value ?? 0), 0))}`}
              />
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
                        href={`/crm/buyers/${b.id}`}
                        className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-brand-50/40"
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
                            {b.product || "Chưa rõ sản phẩm"} · {b.quantity || "chưa rõ số lượng"}
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
              <p className="mt-3 rounded-xl bg-ink-50 px-3.5 py-2.5 text-[11.5px] leading-5 text-ink-500">
                <ShieldCheck className="mr-1 inline h-3 w-3" />
                Đơn đánh dấu “ẩn danh” sẽ không tiết lộ tên buyer trong email gửi NCC.
              </p>
            </Card>
          )}

          {canSeeRfqs && (
            <Card className="p-5">
              <SectionHead icon={Send} title="RFQ đã gửi cho NCC này" sub="Các yêu cầu báo giá trong hệ thống RFQ đã khớp với nhà cung cấp này." />
              {rfqRows.length === 0 ? (
                <EmptyState
                  icon={<Send className="h-5 w-5" />}
                  title="Chưa có RFQ nào"
                  sub="Khi một RFQ được khớp với nhà cung cấp này, RFQ sẽ hiện ở đây kèm trạng thái xử lý."
                />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {rfqRows.map(({ match, rfq }) => {
                    const buyer = buyerById.get(rfq.buyer_id);
                    return (
                      <li key={match.id}>
                        <Link href={`/crm/rfqs/${rfq.id}`} className="block rounded-lg px-2 py-3 transition hover:bg-brand-50/40">
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[13.5px] font-bold text-brand-800">{rfq.code}</span>
                            <Badge className="bg-ink-100 text-ink-600">{RFQ_MATCH_LABELS[match.status] ?? match.status}</Badge>
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] font-medium text-ink-800">{rfq.product_text}</span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-ink-500">
                            {[
                              buyer ? (buyer.hide_buyer_from_supplier ? `Khách thị trường ${buyer.country || "nước ngoài"} (ẩn danh)` : buyer.company) : null,
                              rfq.quantity ? `${rfq.quantity} ${rfq.unit ?? ""}`.trim() : null,
                              rfq.destination_country,
                              formatDate(rfq.created_at),
                            ].filter(Boolean).join(" · ")}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {rfqMatches.length > 8 && <p className="mt-2 text-xs text-ink-500">Đang hiển thị 8 RFQ gần nhất trong tổng số {rfqMatches.length} RFQ.</p>}
            </Card>
          )}

          <MediaGallery
            items={supplierMedia}
            title="Kho ảnh & tài liệu chung của NCC"
            scopeHint="Chỉ tệp lưu trong hồ sơ chung. Bằng chứng kiểm tra giấy tờ, thăm nhà máy và giao hàng được quản lý riêng ở từng bước kiểm; tệp ở đây không tự được AI phân tích."
            showInternal={canSeeInternal}
            manageHref={canManage ? `/crm/suppliers/${id}/edit` : undefined}
            emptyHint="Chưa có tệp chung. Thêm ở trang Sửa, hoặc vào từng bước kiểm để đính kèm bằng chứng."
          />
          {canInspect && <Link href={`/crm/suppliers/${id}/audit/documents`} className="inline-block text-sm font-semibold text-brand-700 hover:underline">Mở bước Kiểm tra giấy tờ để đính kèm bằng chứng →</Link>}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6">
          <Card className="p-4">
            <SectionHead icon={UserRound} title="Tài khoản cổng nhà cung cấp" />
            <p className="text-sm leading-6 text-ink-600">{accountUser
              ? "Tài khoản đăng nhập đang gắn với hồ sơ này. Nhà cung cấp dùng tài khoản này để vào cổng, bổ sung hồ sơ và quản lý sản phẩm của mình. Khi đã có địa chỉ email của doanh nghiệp, bàn giao ở mục bên dưới."
              : "Hồ sơ này chưa có tài khoản đăng nhập. Nhà cung cấp chưa thể tự quản lý hồ sơ và sản phẩm trên cổng cho đến khi được cấp tài khoản hoặc tự đăng ký."}</p>
            <SupplierAccountControls
              supplierId={id}
              defaultEmail={supplier.email ?? ""}
              defaultName={supplier.contact_name ?? ""}
              account={accountUser ? {
                email: accountUser.email,
                isActive: accountUser.is_active,
                lastLoginLabel: accountUser.last_login_at ? formatDate(accountUser.last_login_at) : "Chưa đăng nhập lần nào",
                createdLabel: formatDate(accountUser.created_at),
              } : null}
              canProvision={canManage && (session.role === "admin" || session.role === "sourcing")}
              canHandOver={canManage && (session.role === "admin" || session.role === "sourcing")}
            />
            {showOnboarding && (
              <div className="mt-4 border-t border-ink-100 pt-4">
                <h3 className="text-sm font-bold text-ink-900">Quyền sử dụng cổng</h3>
                <p className="mt-1 text-sm leading-6 text-ink-600">{supplier.onboarding_status === "approved" ? "Đã được Vexim xác nhận tài khoản." : supplier.onboarding_status === "pending" ? "Hồ sơ đã nộp; tài khoản chưa sử dụng được. Kiểm tra thông tin và giấy tờ trước khi xác nhận." : "Đang chờ nhà cung cấp bổ sung thông tin."} Việc xác nhận này không duyệt giấy tờ hay công khai hồ sơ.</p>
                {supplier.onboarding_note && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Yêu cầu bổ sung: {supplier.onboarding_note}</p>}
                {supplier.onboarding_status === "pending" && canManage && (session.role === "admin" || session.role === "sourcing") &&
                  <OnboardingControls supplierId={id} />}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="p-4 pb-0">
              <SectionHead icon={Building2} title="Hồ sơ doanh nghiệp" />
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
              <Row icon={<Clock className="h-3.5 w-3.5" />} label="Mặt hàng" value={supplier.products} />
            </ul>
            {supplier.notes && (
              <div className="border-t border-ink-200 bg-amber-50/50 px-4 py-3">
                <p className="mb-1 text-[11px] font-bold tracking-wide text-amber-700 uppercase">Ghi chú nội bộ</p>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink-700">{supplier.notes}</p>
              </div>
            )}
            {!supplier.email && (
              <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-5 text-amber-900">
                NCC chưa có email nên <strong>không nhận được</strong> thông báo tiến độ tự động. Hãy bổ
                sung email ở nút “Sửa”.
              </div>
            )}
          </Card>
        </aside>
      </div>
    </>
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
          {value || <span className="text-ink-300">Chưa có</span>}
        </span>
      </span>
    </li>
  );
}
