import Link from "next/link";
import { Boxes, ChevronLeft, ChevronRight, ClipboardCheck, Search, Sparkles } from "lucide-react";

import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { listProductsWithSupplier, type ProductWithSupplier } from "@/lib/queries";
import { Badge, Breadcrumbs, Card, EmptyState, formatDate, formatMoney } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { MediaThumb } from "@/components/media-gallery";
import { productReadiness } from "@/lib/media/readiness";
import { completenessSummary, productCompleteness } from "@/lib/products/completeness";
import { auditProductStructuredUnits } from "@/lib/products/grade-pricing";
import { CRM_PRODUCTS_PAGE_SIZE, orderCrmProducts, paginateCrmProducts } from "@/lib/crm/product-list";
import { loadCrmReviewInbox } from "@/lib/crm/product-review-inbox";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sản phẩm nhà cung cấp" };

function tokensOf(text: string): string[] {
  const m = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(m.filter((t) => t.length >= 3))];
}

type ProductView = "all" | "ready" | "pending" | "changes" | "nomedia" | "unit_review";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const canManage = hasPermission(session.role, "products.manage");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = sp.category ?? "";
  const cert = (sp.cert ?? "").trim();
  const verifiedOnly = sp.verified === "1";
  const buyerId = sp.buyer ?? "";
  // Tab xem nhanh; giữ tương thích tham số cũ ?review=pending.
  const view: ProductView = sp.review === "pending" || sp.view === "pending"
    ? "pending"
    : sp.view === "ready" || sp.view === "changes" || sp.view === "nomedia" || sp.view === "unit_review"
      ? sp.view
      : "all";
  const requestedPage = Number(sp.page ?? "1");

  const store = getStore();
  const candidate = buyerId && hasPermission(session.role, "buyers.view") ? await store.getBuyer(buyerId) : null;
  const buyer = candidate && isOwnedBy(candidate.owner, ownerScopeOf(session)) ? candidate : null;

  const [products, allCategories, inboxResult] = await Promise.all([
    listProductsWithSupplier(),
    store.listCategories({ publishedOnly: false }),
    loadCrmReviewInbox(session).then((inbox) => ({ inbox, failed: false })).catch((error) => {
      console.error("[crm-products] review inbox", error);
      return { inbox: null, failed: true };
    }),
  ]);
  const inbox = inboxResult.inbox;
  const legacyPrices = new Set(inbox?.prices.map((row) => row.product_id) ?? []);
  const legacyNames = new Set(inbox?.names.map((row) => row.product_id) ?? []);
  const productsById = new Map(products.map((row) => [row.id, row]));
  const orphanedLegacy = [...(inbox?.prices ?? []), ...(inbox?.names ?? [])].some((row) => !productsById.has(row.product_id));
  const inboxWarning = inboxResult.failed || orphanedLegacy;
  const all = products.map((product) => ({ ...product, pendingReview: product.supplier_review_status === "pending" ||
    legacyPrices.has(product.id) || legacyNames.has(product.id) }));
  const isPrivateShell = (product: ProductWithSupplier) => !product.name.trim() && !product.ready_for_buyer;
  const categoryBySlug = new Map(allCategories.map((c) => [c.slug, c]));
  const unitAuditByProduct = new Map(
    all.map((r) => {
      const catSlug = r.reviewed_category_slug ?? r.supplier_category_proposal ?? r.category ?? "";
      const cat = catSlug ? (categoryBySlug.get(catSlug) ?? { slug: catSlug }) : null;
      return [r.id, auditProductStructuredUnits(r, cat)] as const;
    }),
  );
  const productMedia = await store.listMediaForProducts(all.map((r) => r.id));
  const thumbByProduct = new Map<string, (typeof productMedia)[number]>();
  const mediaByProduct = new Map<string, typeof productMedia>();
  for (const m of productMedia) {
    if (!m.product_id) continue;
    const arr = mediaByProduct.get(m.product_id) ?? [];
    arr.push(m);
    mediaByProduct.set(m.product_id, arr);
    if (m.kind !== "image" || m.audience !== "buyer") continue;
    if (!thumbByProduct.has(m.product_id)) thumbByProduct.set(m.product_id, m);
  }
  const hasShareableMedia = (id: string) => productReadiness(mediaByProduct.get(id) ?? []).ready;
  /** Độ hoàn thiện hồ sơ: chỉ đọc, tính từ bản đã lưu + tệp hiện có. */
  const completenessByProduct = new Map(all.map((r) => [r.id, productCompleteness(r, mediaByProduct.get(r.id) ?? [])]));
  const categoryFor = (r: ProductWithSupplier) => r.category;
  const nameFor = (r: ProductWithSupplier) => r.name;
  const categories = [...new Set(all.map(categoryFor).filter(Boolean))] as string[];

  const viewCounts: Record<ProductView, number> = {
    all: all.length,
    ready: all.filter((r) => r.ready_for_buyer).length,
    pending: all.filter((r) => r.pendingReview).length,
    changes: all.filter((r) => r.supplier_review_status === "changes_requested").length,
    nomedia: all.filter((r) => !hasShareableMedia(r.id)).length,
    unit_review: all.filter((r) => unitAuditByProduct.get(r.id)?.needsReview).length,
  };

  let rows = all;
  if (view === "pending") rows = rows.filter((r) => r.pendingReview);
  if (view === "changes") rows = rows.filter((r) => r.supplier_review_status === "changes_requested");
  if (view === "ready") rows = rows.filter((r) => r.ready_for_buyer);
  if (view === "nomedia") rows = rows.filter((r) => !hasShareableMedia(r.id));
  if (view === "unit_review") rows = rows.filter((r) => unitAuditByProduct.get(r.id)?.needsReview);
  if (category) rows = rows.filter((r) => (categoryFor(r) ?? "") === category);
  if (verifiedOnly) rows = rows.filter((r) => r.supplier?.status === "verified");
  if (cert) rows = rows.filter((r) => (r.certifications ?? "").toLowerCase().includes(cert.toLowerCase()));

  const needle = q || buyer?.product || "";
  const tokens = tokensOf(needle);
  const score = (r: ProductWithSupplier) =>
    tokens.filter((t) =>
      `${r.name} ${r.category} ${r.spec} ${r.description}`.toLowerCase().includes(t),
    ).length;
  if (q) {
    const ql = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        `${nameFor(r)} ${categoryFor(r)} ${r.name} ${r.category} ${r.spec} ${r.supplier?.name ?? ""}`.toLowerCase().includes(ql),
    );
  }
  rows = orderCrmProducts(rows, tokens.length > 0 ? score : undefined);
  const { visibleRows, currentPage, pageCount, firstRow, lastRow } = paginateCrmProducts(rows, requestedPage);

  const productsHref = (nextView: ProductView, nextPage = 1) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (cert) params.set("cert", cert);
    if (verifiedOnly) params.set("verified", "1");
    if (buyerId) params.set("buyer", buyerId);
    if (nextView !== "all") params.set("view", nextView);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/crm/products?${qs}` : "/crm/products";
  };
  const viewTabs: Array<{ key: ProductView; label: string }> = [
    { key: "all", label: "Tất cả" },
    { key: "ready", label: "Sẵn sàng gửi khách mua" },
    { key: "pending", label: "Chờ Vexim kiểm tra" },
    { key: "changes", label: "Chờ nhà cung cấp sửa" },
    { key: "nomedia", label: "Thiếu ảnh/catalogue" },
    { key: "unit_review", label: "Cần chuẩn hóa đơn vị" },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Sản phẩm nhà cung cấp" }]} />}
        title="Sản phẩm nhà cung cấp"
        sub={`${all.length} hồ sơ sản phẩm · giá tham khảo có thời hạn; báo giá chính thức do nhà cung cấp xác nhận theo RFQ`}
        actions={canManage ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/crm/products/import" className="btn btn-soft">
              Nhập từ Excel
            </Link>
            <Link href="/crm/suppliers" className="btn btn-primary">
              Thêm sản phẩm qua hồ sơ nhà cung cấp
            </Link>
          </div>
        ) : undefined}
      />

      {inboxWarning && <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Chưa đối chiếu được đầy đủ các bản chờ duyệt. Không dựa vào số đếm hoặc trạng thái tại đây để kết luận hàng chờ trống.
        {inboxResult.failed && <span> Hãy thử tải lại trang.</span>}
        <div className="mt-2 flex flex-wrap gap-4"><Link className="font-semibold underline" href="/crm/products/quantity-review">Kiểm tra các bản giá và tên</Link></div>
      </div>}
      {/* KPI tổng quan */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { value: viewCounts.all, label: "Tổng hồ sơ sản phẩm" },
          { value: viewCounts.ready, label: "Sẵn sàng gửi khách mua" },
          { value: viewCounts.pending, label: "Sản phẩm chờ kiểm tra", warn: viewCounts.pending > 0 },
          { value: viewCounts.nomedia, label: "Chưa có ảnh/catalogue chia sẻ cho khách mua", warn: viewCounts.nomedia > 0 },
        ].map((k) => (
          <div key={k.label} className="card px-4 py-3.5">
            <p className={`text-[22px] font-black leading-none ${k.warn ? "text-amber-600" : "text-ink-900"}`}>{k.value}</p>
            <p className="mt-1.5 text-xs text-ink-500">{k.label}</p>
          </div>
        ))}
      </div>

      {buyer && (
        <Card className="mb-5 border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-start gap-3 px-4 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-ink-900">
                Đang so khớp cho RFQ: {buyer.company}
                <span className="ml-2 font-normal text-ink-500">
                  (<Link className="text-brand-700 hover:underline" href={`/crm/buyers/${buyer.id}`}>xem khách mua</Link>)
                </span>
              </p>
              <p className="mt-1 text-[12.5px] text-ink-700">
                {buyer.product || "—"} · {buyer.quantity || "—"} · {buyer.spec || "—"}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-500">
                Giá mục tiêu {buyer.target_price || "—"} · {buyer.incoterm ?? ""} {buyer.port ?? ""} · giao{" "}
                {formatDate(buyer.expected_ship_date)}
              </p>
              <p className="mt-1.5 text-[11.5px] text-ink-500">
                Hệ thống sắp xếp sản phẩm trùng nhóm hàng lên trước — người vận hành duyệt thủ công rồi mới
                gửi yêu cầu báo giá cho nhà cung cấp.
              </p>
            </div>
            <Link href={`/crm/products`} className="btn btn-ghost">
              Xoá so khớp
            </Link>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {/* Tab xem nhanh theo tình trạng xử lý */}
        <div className="flex flex-wrap gap-1.5 border-b border-ink-200 px-3 pt-3" role="tablist" aria-label="Xem theo tình trạng">
          {viewTabs.map((t) => (
            <Link
              key={t.key}
              href={productsHref(t.key)}
              role="tab"
              aria-selected={view === t.key}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${view === t.key ? "border-ink-900 bg-ink-900 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
            >
              {t.label} <span className="font-normal opacity-60">{viewCounts[t.key]}</span>
            </Link>
          ))}
        </div>

        <form method="GET" className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-3">
          {buyerId && <input type="hidden" name="buyer" value={buyerId} />}
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              className="input pl-9"
              name="q"
              defaultValue={q}
              placeholder="Tìm sản phẩm, quy cách, nhà cung cấp..."
            />
          </div>
          <select className="input w-auto" name="category" defaultValue={category}>
            <option value="">Mọi nhóm ngành</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input className="input w-[160px]" name="cert" defaultValue={cert} placeholder="Chứng nhận: BRC, EU..." />
          <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-ink-700">
            <input type="checkbox" name="verified" value="1" defaultChecked={verifiedOnly} className="h-4 w-4 accent-[#0f766e]" />
            Chỉ nhà cung cấp đã xác minh
          </label>
          <button type="submit" className="btn btn-primary">
            Lọc
          </button>
          <Link href={buyerId ? `/crm/products?buyer=${buyerId}` : "/crm/products"} className="btn btn-ghost">
            Xoá lọc
          </Link>
          <span className="ml-auto text-xs text-ink-500">{rows.length} / {all.length} sản phẩm khớp</span>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="Không có sản phẩm nào khớp bộ lọc"
            sub="Thử từ khoá khác, hoặc thêm hồ sơ sản phẩm từ trang chi tiết nhà cung cấp."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {visibleRows.map((r) => {
              const matched = tokens.length > 0 && score(r) > 0;
              const shareable = hasShareableMedia(r.id);
              const privateShell = isPrivateShell(r);
              const displayName = nameFor(r) || "Sản phẩm chưa có tên";
              const displayCategory = categoryFor(r) || "Chưa phân loại";
              const legacyReview = legacyPrices.has(r.id) || legacyNames.has(r.id);
              const reviewHref = legacyReview ? "/crm/products/quantity-review" : `/crm/products/${r.id}/edit`;
              return (
                <li key={r.id} className={`px-4 py-4 ${matched ? "bg-brand-50/40" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <MediaThumb asset={thumbByProduct.get(r.id) ?? null} size="h-14 w-14" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/crm/products/${r.id}`} className="break-words text-sm font-bold text-ink-900 hover:text-brand-700 hover:underline">{displayName}</Link>
                        <p className="mt-1 break-words text-xs leading-5 text-ink-500">
                          {r.supplier ? (
                            <Link className="font-semibold text-ink-700 hover:text-brand-700 hover:underline" href={`/crm/suppliers/${r.supplier.id}`}>
                              {r.supplier.name}
                            </Link>
                          ) : "Chưa có nhà cung cấp"}
                          <span aria-hidden="true"> · </span>{displayCategory}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {matched && <Badge className="bg-brand-50 text-brand-700"><Sparkles className="h-3 w-3" /> Khớp nhu cầu</Badge>}
                          {r.supplier_review_status === "pending" && <Badge className="bg-amber-100 text-amber-900">Chờ Vexim kiểm tra</Badge>}
                          {legacyReview && <Badge className="bg-amber-100 text-amber-900">Chờ rà soát giá hoặc tên</Badge>}
                          {r.supplier_review_status === "changes_requested" && <Badge className="bg-orange-50 text-orange-800">Chờ nhà cung cấp sửa</Badge>}
                          {r.supplier_review_status === "paused" ? (
                            <Badge className="bg-slate-200 text-slate-800">Nhà cung cấp đã tạm ẩn</Badge>
                          ) : r.ready_for_buyer ? (
                            <Badge className="bg-emerald-50 text-emerald-700">Sẵn sàng gửi khách mua</Badge>
                          ) : shareable ? (
                            <Badge className="bg-ink-100 text-ink-600">Chưa sẵn sàng gửi khách mua</Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-amber-700">Thiếu ảnh/catalogue</Badge>
                          )}
                          {completenessByProduct.get(r.id)?.next && (
                            <Badge className="bg-ink-100 text-ink-700" title={completenessSummary(completenessByProduct.get(r.id)!)}>
                              Hồ sơ {completenessByProduct.get(r.id)!.score}%
                            </Badge>
                          )}
                          {unitAuditByProduct.get(r.id)?.needsReview && (
                            <Badge className="bg-amber-100 text-amber-900">
                              Cần sửa đơn vị: {unitAuditByProduct.get(r.id)!.reasons[0]}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3 sm:shrink-0 sm:justify-end sm:border-t-0 sm:pt-0">
                      <div className="min-w-0 sm:text-right">
                        <p className="text-[11px] text-ink-500">Giá tham khảo</p>
                        {r.ref_price !== null ? <>
                          <p className="break-words text-[13px] font-bold text-ink-900"><span className="font-mono tabular-nums">{formatMoney(r.ref_price)}</span> <span className="font-normal text-ink-500">/ {r.unit || "đv"}</span></p>
                          {r.price_valid_until && <p className="text-[11px] text-ink-500">Đến {formatDate(r.price_valid_until)}</p>}
                        </> : <p className="text-xs text-ink-500">Chưa có giá</p>}
                      </div>
                      {canManage && (inboxResult.failed ? <button type="button" disabled className="btn btn-soft shrink-0 px-3 py-2 text-[13px]" title="Chưa tải được hàng chờ duyệt">Kiểm tra</button> :
                        <Link href={reviewHref} aria-label={`Kiểm tra ${displayName}`} className="btn btn-soft shrink-0 px-3 py-2 text-[13px]">
                          <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Kiểm tra
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
          <p className="text-[11.5px] text-ink-500">Hiển thị {firstRow}-{lastRow} trong {rows.length} sản phẩm. Mỗi trang tối đa {CRM_PRODUCTS_PAGE_SIZE} sản phẩm.</p>
          {pageCount > 1 && <nav aria-label="Phân trang sản phẩm" className="flex items-center gap-2">
            {currentPage > 1 && <Link href={productsHref(view, currentPage - 1)} className="btn btn-ghost px-2.5 py-1.5" aria-label="Trang trước">
              <ChevronLeft className="h-4 w-4" /> Trước
            </Link>}
            <span className="min-w-[84px] text-center text-[12px] text-ink-600" aria-current="page">Trang {currentPage} / {pageCount}</span>
            {currentPage < pageCount && <Link href={productsHref(view, currentPage + 1)} className="btn btn-ghost px-2.5 py-1.5" aria-label="Trang sau">
              Sau <ChevronRight className="h-4 w-4" />
            </Link>}
          </nav>}
        </div>}
      </Card>
    </>
  );
}
