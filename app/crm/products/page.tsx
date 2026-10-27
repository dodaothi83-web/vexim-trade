import Link from "next/link";
import { Boxes, CalendarClock, ChevronLeft, ChevronRight, Pencil, Search, ShieldCheck, Sparkles } from "lucide-react";

import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { listProductsWithSupplier, type ProductWithSupplier } from "@/lib/queries";
import { roleLabel, statusMeta } from "@/lib/supplier";
import { Badge, Breadcrumbs, Card, EmptyState, formatDate, formatMoney } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { MediaThumb } from "@/components/media-gallery";
import { productReadiness } from "@/lib/media/readiness";
import { CRM_PRODUCTS_PAGE_SIZE, orderCrmProducts, paginateCrmProducts } from "@/lib/crm/product-list";
import { productCompleteness } from "@/lib/supplier-portal/product-completeness";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sản phẩm NCC" };

function tokensOf(text: string): string[] {
  const m = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(m.filter((t) => t.length >= 3))];
}

type ProductView = "all" | "ready" | "pending" | "changes" | "nomedia";

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
    : sp.view === "ready" || sp.view === "changes" || sp.view === "nomedia"
      ? sp.view
      : "all";
  const requestedPage = Number(sp.page ?? "1");

  const store = getStore();
  const candidate = buyerId && hasPermission(session.role, "buyers.view") ? await store.getBuyer(buyerId) : null;
  const buyer = candidate && isOwnedBy(candidate.owner, ownerScopeOf(session)) ? candidate : null;

  const all = await listProductsWithSupplier();
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
  // Điểm hoàn thiện hồ sơ: staff nhìn thấy sản phẩm nào cần đẩy NCC bổ sung.
  const completenessByProduct = new Map(all.map((r) => [r.id, productCompleteness(r, mediaByProduct.get(r.id) ?? [])]));
  const categories = [...new Set(all.map((r) => r.category).filter(Boolean))] as string[];

  const viewCounts: Record<ProductView, number> = {
    all: all.length,
    ready: all.filter((r) => r.ready_for_buyer).length,
    pending: all.filter((r) => r.supplier_review_status === "pending").length,
    changes: all.filter((r) => r.supplier_review_status === "changes_requested").length,
    nomedia: all.filter((r) => !hasShareableMedia(r.id)).length,
  };

  let rows = all;
  if (view === "pending") rows = rows.filter((r) => r.supplier_review_status === "pending");
  if (view === "changes") rows = rows.filter((r) => r.supplier_review_status === "changes_requested");
  if (view === "ready") rows = rows.filter((r) => r.ready_for_buyer);
  if (view === "nomedia") rows = rows.filter((r) => !hasShareableMedia(r.id));
  if (category) rows = rows.filter((r) => (r.category ?? "") === category);
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
        `${r.name} ${r.category} ${r.spec} ${r.supplier?.name ?? ""}`.toLowerCase().includes(ql),
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
    { key: "ready", label: "Sẵn sàng gửi buyer" },
    { key: "pending", label: "Chờ Vexim kiểm tra" },
    { key: "changes", label: "Cần NCC sửa" },
    { key: "nomedia", label: "Thiếu ảnh/catalogue" },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Sản phẩm NCC" }]} />}
        title="Sản phẩm nhà cung cấp"
        sub={`${all.length} hồ sơ sản phẩm · giá chỉ là tham khảo có thời hạn, báo giá chính thức do NCC xác nhận theo từng RFQ`}
        actions={canManage ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/crm/products/import" className="btn btn-soft">
              Nhập từ Excel
            </Link>
            <Link href="/crm/suppliers" className="btn btn-primary">
              Thêm sản phẩm qua hồ sơ NCC
            </Link>
          </div>
        ) : undefined}
      />

      {/* KPI tổng quan */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { value: viewCounts.all, label: "Tổng hồ sơ sản phẩm" },
          { value: viewCounts.ready, label: "Sẵn sàng gửi buyer" },
          { value: viewCounts.pending, label: "NCC tự đăng · chờ kiểm tra", warn: viewCounts.pending > 0 },
          { value: viewCounts.nomedia, label: "Chưa có ảnh/catalogue chia sẻ buyer", warn: viewCounts.nomedia > 0 },
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
                  (<Link className="text-brand-700 hover:underline" href={`/crm/buyers/${buyer.id}`}>xem buyer</Link>)
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
                gửi yêu cầu báo giá cho NCC.
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
              placeholder="Tìm sản phẩm, quy cách, NCC..."
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
            Chỉ NCC đã xác minh
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
            sub="Thử từ khoá khác, hoặc thêm hồ sơ sản phẩm từ trang chi tiết NCC."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {visibleRows.map((r) => {
              const matched = tokens.length > 0 && score(r) > 0;
              const st = statusMeta(r.supplier?.status ?? "new");
              const shareable = hasShareableMedia(r.id);
              return (
                <li key={r.id} className={`px-4 py-3.5 ${matched ? "bg-brand-50/40" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                     <MediaThumb asset={thumbByProduct.get(r.id) ?? null} size="h-14 w-14" />
                     <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {matched && (
                          <Badge className="bg-brand-600 text-white">
                            <Sparkles className="h-3 w-3" /> khớp nhu cầu
                          </Badge>
                        )}
                        <Link href={`/crm/products/${r.id}`} className="text-[13.5px] font-semibold text-ink-900 hover:text-brand-700 hover:underline">{r.name}</Link>
                        <Badge className="bg-brand-50 text-brand-700">{r.category || "Khác"}</Badge>
                        {r.supplier_review_status === "pending" && <Badge className="bg-amber-100 text-amber-900">NCC tự đăng · chờ Vexim kiểm tra</Badge>}
                        {r.supplier_review_status === "changes_requested" && <Badge className="bg-orange-50 text-orange-800">Cần NCC sửa</Badge>}
                        {r.ready_for_buyer ? (
                          <Badge className="bg-emerald-50 text-emerald-700">Sẵn sàng gửi buyer</Badge>
                        ) : shareable ? (
                          <Badge className="bg-ink-100 text-ink-600">Chưa bật sẵn sàng gửi buyer</Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700">Thiếu ảnh/catalogue</Badge>
                        )}
                        {(() => {
                          const complete = completenessByProduct.get(r.id);
                          if (!complete) return null;
                          return <span title={`Điểm hoàn thiện hồ sơ: ${complete.score}/100 — ${complete.label}. Việc còn thiếu: ${complete.missing.slice(0, 3).map((m) => m.label).join("; ") || "đã đủ"}`}><Badge className={complete.tone}>Hoàn thiện {complete.score}/100</Badge></span>;
                        })()}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-ink-500">{r.spec || r.description || "—"}</p>
                      <p className="mt-1 text-[12px] text-ink-600">
                        NCC:{" "}
                        {r.supplier ? (
                          <Link className="font-semibold text-brand-700 hover:underline" href={`/crm/suppliers/${r.supplier.id}`}>
                            {r.supplier.name}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {r.supplier && (
                          <span className="text-ink-400">
                            {" "}· {roleLabel(r.supplier.role)} · <span className={st.badge}>{st.label}</span>
                          </span>
                        )}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                        {r.moq && <Badge className="bg-ink-50 text-ink-600">MOQ {r.moq}</Badge>}
                        {r.monthly_capacity && <Badge className="bg-ink-50 text-ink-600">{r.monthly_capacity}</Badge>}
                        {r.lead_time_days !== null && (
                          <Badge className="bg-ink-50 text-ink-600">
                            <CalendarClock className="h-3 w-3" /> {r.lead_time_days} ngày
                          </Badge>
                        )}
                        {r.export_port && <Badge className="bg-ink-50 text-ink-600">cảng {r.export_port}</Badge>}
                        {r.certifications && (
                          <Badge className="bg-emerald-50 text-emerald-700">
                            <ShieldCheck className="h-3 w-3" /> {r.certifications}
                          </Badge>
                        )}
                        {r.oem && <Badge className="bg-violet-50 text-violet-700">OEM</Badge>}
                        {r.samples && <Badge className="bg-sky-50 text-sky-700">gửi mẫu</Badge>}
                      </div>
                     </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      {r.ref_price !== null ? (
                        <>
                          <p className="text-[13px] font-bold text-ink-900">
                            {formatMoney(r.ref_price)}{" "}
                            <span className="font-normal text-ink-400">/ {r.unit || "đv"}</span>
                          </p>
                          <p className="text-[11px] text-ink-400">
                            {r.incoterm ?? ""} {r.incoterm_place ?? ""}
                            {r.price_valid_until ? ` · đến ${formatDate(r.price_valid_until)}` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="text-[12px] text-ink-400">chưa có giá tham khảo</p>
                      )}
                      <div className="mt-1 flex gap-1.5">
                        <Link href={`/crm/products/${r.id}`} className="btn btn-ghost px-2.5 py-1.5 text-[13px]">
                          Xem
                        </Link>
                        {canManage && (
                          <Link href={`/crm/products/${r.id}/edit`} className="btn btn-soft px-2.5 py-1.5 text-[13px]">
                            <Pencil className="h-3.5 w-3.5" />
                            Sửa
                          </Link>
                        )}
                      </div>
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
