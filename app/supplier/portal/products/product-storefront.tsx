"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Clock3, EyeOff, FileText, ImageIcon, PackagePlus, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { MediaAsset, SupplierProduct } from "@/lib/types";
import { PRODUCT_STATUS, SUPPLIER_PRODUCTS_PER_PAGE, privateMediaUrl, productReview, supplierProductPage, type ProductReviewFilter } from "@/lib/supplier-portal/product-view";
import { completenessSummary, productCompleteness } from "@/lib/products/completeness";
import { fill } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { ProductsMessages } from "@/lib/i18n/portal/products";

/** Bộ lọc trạng thái; nhãn đọc từ từ điển theo `id`, không giữ chữ trong hằng số. */
const FILTERS = ["all", "draft", "pending", "changes_requested", "approved", "paused"] as const;

function money(product: SupplierProduct, intl: string) {
  if (product.ref_price == null) return null;
  const format = (n: number) => new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(n);
  const range = product.ref_price_max != null && product.ref_price_max > product.ref_price ? `-${format(product.ref_price_max)}` : "";
  return `${format(product.ref_price)}${range} ${product.currency || "USD"}${product.unit ? ` / ${product.unit}` : ""}`;
}

/** Ngày cập nhật theo giờ Việt Nam để máy chủ và trình duyệt không lệch nhau. */
function updatedLabel(value: string | null | undefined, intl: string) {
  const time = Date.parse(value ?? "");
  if (!Number.isFinite(time)) return "—";
  return new Intl.DateTimeFormat(intl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(time));
}

export function SupplierProductStorefront({ products, media, supplierPublished, categoryLabels = {}, scope, messages: m, lang, intl }: {
  products: SupplierProduct[]; media: MediaAsset[]; supplierPublished: boolean;
  /** Nhãn danh mục theo slug - để thẻ sản phẩm không hiện slug thô. */
  categoryLabels?: Record<string, string>;
  /** Phạm vi danh mục NCC được chọn; sản phẩm ngoài phạm vi bị đánh dấu rõ. */
  scope?: string[];
  messages: ProductsMessages;
  lang: Locale;
  intl: string;
}) {
  const copy = m.list;
  const filterLabel = (id: typeof FILTERS[number]) => id === "changes_requested" ? copy.kpi.changes
    : id === "all" ? copy.kpi.all : copy.kpi[id as "draft" | "pending" | "approved" | "paused"];
  const [filter, setFilter] = useState<ProductReviewFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [page, setPage] = useState(1);
  const mediaByProduct = useMemo(() => {
    const grouped = new Map<string, MediaAsset[]>();
    for (const asset of media) if (asset.product_id) grouped.set(asset.product_id, [...(grouped.get(asset.product_id) ?? []), asset]);
    return grouped;
  }, [media]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((id) => [id, id === "all" ? products.length : products.filter((p) => productReview(p) === id).length])), [products]);
  const label = (slug: string | null) => slug ? categoryLabels[slug] ?? slug : copy.unsetCategory;
  const outsideScope = useMemo(
    () => (scope ? products.filter((p) => p.category && !scope.includes(p.category)) : []),
    [products, scope],
  );
  const visible = useMemo(() => products.filter((p) =>
    (filter === "all" || productReview(p) === filter) &&
    `${p.name} ${p.spec ?? ""} ${p.description ?? ""}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi")))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "vi") :
      (Date.parse(b.updated_at ?? "") || 0) - (Date.parse(a.updated_at ?? "") || 0)), [products, filter, query, sort]);
  const { shown, currentPage, pageCount, firstItem, lastItem } = supplierProductPage(visible, page);
  const meta = (p: SupplierProduct) => {
    const assets = mediaByProduct.get(p.id) ?? [];
    const image = assets.find((m) => m.id === p.featured_media_id && m.kind === "image" && m.audience === "buyer" && privateMediaUrl(m)) ??
      assets.find((m) => m.kind === "image" && privateMediaUrl(m));
    const imageSrc = image && privateMediaUrl(image);
    // Cùng thang điểm với trang sửa: bỏ mục nhà cung cấp không có ô để điền.
    const completeness = productCompleteness(p, assets, { supplierView: true });
    const review = productReview(p);
    const status = PRODUCT_STATUS[review];
    const statusLabel = review === "approved" && !p.ready_for_buyer ? copy.approvedPendingPublish : m.statuses[review];
    const outside = !!(scope && p.category && !scope.includes(p.category));
    return { imageSrc, completeness, status, statusLabel, outside };
  };

  return <div className="space-y-3.5" lang={lang}>
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold tracking-[0.16em] text-brand-700 uppercase">{copy.eyebrow}</p>
        <h1 className="mt-0.5 text-[22px] leading-tight font-black tracking-tight text-ink-900">{copy.title}</h1>
        <p className="mt-0.5 max-w-2xl text-[12.5px] leading-5 text-ink-500">{copy.sub}</p>
      </div>
      <Link href="/supplier/portal/products/new" className="btn btn-primary"><Plus className="size-4" aria-hidden="true" /> {copy.addProduct}</Link>
    </header>

    {outsideScope.length > 0 && <p className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
      <span className="font-bold">{fill(copy.outsideScopeTitle, { count: outsideScope.length })}</span>
      <span className="text-amber-800">{copy.outsideScopeBody}</span>
      <Link href="/supplier/portal/categories" className="font-bold underline">{copy.chooseMoreCategories}</Link>
    </p>}

    {/* Số liệu theo trạng thái: một dải mảnh, không chiếm chỗ của danh sách. */}
    <section aria-label={copy.kpiAria} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {[
        { label: copy.kpi.all, value: counts.all, icon: PackagePlus, tone: "bg-brand-50 text-brand-700" },
        { label: copy.kpi.draft, value: counts.draft, icon: FileText, tone: "bg-slate-100 text-slate-700" },
        { label: copy.kpi.pending, value: counts.pending, icon: Clock3, tone: "bg-amber-100 text-amber-900" },
        { label: copy.kpi.changes, value: counts.changes_requested, icon: SlidersHorizontal, tone: "bg-rose-100 text-rose-800" },
        { label: copy.kpi.approved, value: counts.approved, icon: BadgeCheck, tone: "bg-emerald-100 text-emerald-800" },
        { label: copy.kpi.paused, value: counts.paused, icon: EyeOff, tone: "bg-slate-200 text-slate-800" },
      ].map((item) => <div key={item.label} className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 py-2">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${item.tone}`}><item.icon className="size-3.5" aria-hidden="true" /></span>
        <span className="min-w-0"><p className="truncate text-[10.5px] font-semibold text-ink-500">{item.label}</p>
          <p className="text-[15px] font-black leading-tight tabular-nums text-ink-900">{item.value}</p></span>
      </div>)}
    </section>

    <section aria-label={copy.sectionAria} className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="border-b border-ink-100 px-3.5 py-3 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-black text-ink-900">{copy.categoryTitle}</h2>
            <p className="text-[11.5px] leading-5 text-ink-500">{copy.categorySub}</p>
          </div>
          {!supplierPublished && <span className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-900">{copy.notPublic}</span>}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <label className="relative min-w-[180px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <span className="sr-only">{copy.searchLabel}</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={copy.searchPlaceholder} className="input py-1.5 pl-10" /></label>
          {/* .input mặc định width:100% nên select phải có w-auto, nếu không nó giành hết bề rộng label và ép chữ "Sắp xếp" xuống từng dòng. */}
          <label className="ml-auto flex shrink-0 items-center gap-2 text-[11.5px] font-semibold text-ink-600"><span className="whitespace-nowrap">{copy.sort}</span><select className="input w-auto min-w-[132px] py-1.5" value={sort} onChange={(e) => { setSort(e.target.value as "recent" | "name"); setPage(1); }}><option value="recent">{copy.sortRecent}</option><option value="name">{copy.sortName}</option></select></label>
        </div>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label={copy.filterAria}>{FILTERS.map((id) =>
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(1); }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11.5px] font-bold transition ${filter === id ? "bg-brand-800 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>{filterLabel(id)} <span className={`tabular-nums ${filter === id ? "text-brand-100" : "text-ink-500"}`}>{counts[id]}</span></button>)}</div>
      </div>

      {visible.length ? <>
        {/* Bảng dày cho màn hình lớn: nhìn được nhiều sản phẩm trong một màn hình. */}
        <table className="hidden w-full border-collapse text-left lg:table">
          <caption className="sr-only">{fill(copy.caption, { order: sort === "name" ? copy.captionName : copy.captionRecent })}</caption>
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-[10.5px] font-bold tracking-[0.06em] text-ink-500 uppercase">
              <th scope="col" className="px-3 py-2 font-bold">{copy.columns.product}</th>
              <th scope="col" className="px-2 py-2 font-bold">{copy.columns.category}</th>
              <th scope="col" className="px-2 py-2 text-right font-bold">{copy.columns.price}</th>
              <th scope="col" className="px-2 py-2 font-bold">MOQ</th>
              <th scope="col" className="px-2 py-2 font-bold">{copy.columns.status}</th>
              <th scope="col" className="px-2 py-2 font-bold">{copy.columns.completeness}</th>
              <th scope="col" className="px-2 py-2 font-bold">{copy.columns.updated}</th>
              <th scope="col" className="px-2 py-2"><span className="sr-only">{copy.columns.open}</span></th>
            </tr>
          </thead>
          <tbody>{shown.map((p) => {
            const { imageSrc, completeness, status, statusLabel, outside } = meta(p);
            const percent = Math.max(0, Math.min(100, Math.round(completeness.score)));
            return <tr key={p.id} className="border-b border-ink-100 align-middle last:border-b-0 hover:bg-brand-50/40">
              <td className="max-w-[280px] px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <Link href={`/supplier/portal/products/${p.id}`} aria-label={fill(copy.openAria, { name: p.name })} className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink-200 bg-ink-50">
                    {imageSrc ? <img src={imageSrc} alt="" loading="lazy" className="size-full object-cover" />
                      : <ImageIcon className="size-4 text-ink-400" aria-hidden="true" />}
                  </Link>
                  <div className="min-w-0">
                    <Link href={`/supplier/portal/products/${p.id}`} className="line-clamp-1 text-[12.5px] font-bold text-ink-900 hover:text-brand-700">{p.name}</Link>
                    <p className="line-clamp-1 text-[11px] text-ink-500">{p.spec || p.description || copy.noSpec}</p>
                    {p.supplier_review_note && <p className="line-clamp-1 text-[11px] font-medium text-rose-700">{fill(copy.reviewNote, { note: p.supplier_review_note })}</p>}
                  </div>
                </div>
              </td>
              <td className="px-2 py-2 text-[11.5px] text-ink-700">
                <span className="line-clamp-1">{label(p.category)}</span>
                {outside && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">{copy.outOfScope}</span>}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[12px] font-bold tabular-nums text-ink-900">{money(p, intl) ?? <span className="font-sans font-medium text-ink-400">{copy.notEntered}</span>}</td>
              <td className="whitespace-nowrap px-2 py-2 text-[11.5px] text-ink-700">{p.moq || "—"}</td>
              <td className="px-2 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold ${status.tone}`}>{statusLabel}</span></td>
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100"><span className={`block h-full rounded-full ${percent >= 100 ? "bg-brand-600" : "bg-amber-500"}`} style={{ width: `${percent}%` }} /></span>
                  <span className="text-[10.5px] font-bold tabular-nums text-ink-600">{percent}%</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-[11px] text-ink-500">{updatedLabel(p.updated_at, intl)}</td>
              <td className="px-2 py-2 text-right"><Link href={`/supplier/portal/products/${p.id}`} aria-label={fill(copy.editAria, { name: p.name })} className="inline-flex size-7 items-center justify-center rounded-md text-brand-700 hover:bg-brand-50"><ArrowRight className="size-3.5" aria-hidden="true" /></Link></td>
            </tr>;
          })}</tbody>
        </table>

        {/* Màn hình nhỏ: thẻ gọn, vẫn đủ trạng thái và việc cần bổ sung. */}
        <ul className="grid gap-2.5 p-3 sm:grid-cols-2 sm:p-6 lg:hidden lg:grid-cols-3 xl:grid-cols-5">{shown.map((p) => {
          const { imageSrc, completeness, status, statusLabel, outside } = meta(p);
          return <li key={p.id} className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-ink-200 bg-white transition hover:border-brand-300 hover:shadow-md">
            <Link href={`/supplier/portal/products/${p.id}`} aria-label={fill(copy.viewAria, { name: p.name })} className="relative block aspect-square overflow-hidden bg-gradient-to-br from-ink-100 via-brand-50 to-ink-100">
              {imageSrc ? <img src={imageSrc} alt={fill(copy.photoAlt, { name: p.name })} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                : <div className="flex size-full flex-col items-center justify-center gap-2 text-ink-400"><ImageIcon className="size-9 stroke-1" aria-hidden="true" /><span className="text-[11px] font-semibold">{copy.noPhoto}</span></div>}
              <span className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${status.tone}`}>{statusLabel}</span>
            </Link>
            <div className="flex flex-1 flex-col p-2.5">
              <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold tracking-wider text-brand-700 uppercase">
                {label(p.category)}
                {outside && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] normal-case text-amber-900">{copy.outOfScope}</span>}
              </p>
              <Link href={`/supplier/portal/products/${p.id}`} className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-5 text-ink-900 hover:text-brand-700">{p.name}</Link>
              <p className="mt-0.5 line-clamp-2 min-h-8 text-[11.5px] leading-4 text-ink-600">{p.spec || p.description || copy.specPrompt}</p>
              {completeness.next && <p className="mt-1 text-[11px] font-medium text-amber-800">{completenessSummary(completeness, { ...m.summary, lang })}</p>}
              <div className="mt-2 flex items-end justify-between gap-2 border-t border-ink-100 pt-2">
                <div className="min-w-0">{money(p, intl) ? <><p className="text-[10px] text-ink-500">{copy.priceNote}</p><p className="truncate font-mono text-[13px] font-bold tabular-nums text-ink-900">{money(p, intl)}</p></> : <p className="text-[11px] text-ink-500">{copy.noPrice}</p>}
                  {p.moq && <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">{fill(copy.moqInline, { moq: p.moq })}</p>}</div>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white"><ArrowRight className="size-3.5" aria-hidden="true" /></span>
              </div>
              {p.supplier_review_note && <p className="mt-2 line-clamp-2 rounded bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-800">{fill(copy.reviewNote, { note: p.supplier_review_note })}</p>}
            </div>
          </li>;
        })}</ul>
      </> : <div className="mx-auto max-w-md px-6 py-14 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><PackagePlus className="size-7" aria-hidden="true" /></div>
        <h3 className="mt-3 text-lg font-bold text-ink-900">{products.length ? copy.emptyFilteredTitle : copy.emptyTitle}</h3>
        <p className="mt-1.5 text-[13px] leading-6 text-ink-600">{products.length ? copy.emptyFilteredBody : copy.emptyBody}</p>
        {products.length === 0 && <Link href="/supplier/portal/products/new" className="btn btn-primary mt-4"><Plus className="size-4" aria-hidden="true" /> {copy.addProduct}</Link>}
        {products.length > 0 && <button type="button" onClick={() => { setFilter("all"); setQuery(""); setPage(1); }} className="mt-4 text-sm font-semibold text-brand-700 underline">{copy.clearFilters}</button>}
      </div>}
      {pageCount > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-3.5 py-2.5 sm:px-4">
        <p className="text-[11px] text-ink-500">{fill(copy.page, { first: firstItem, last: lastItem, total: visible.length, perPage: SUPPLIER_PRODUCTS_PER_PAGE })}</p>
        <nav aria-label={copy.pageAria} className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost px-2.5 py-1.5" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label={copy.prevAria}>
            <ChevronLeft className="size-4" aria-hidden="true" /> {copy.prev}
          </button>
          <span className="min-w-[84px] text-center text-[12px] text-ink-600" aria-live="polite">{fill(copy.pageOf, { page: currentPage, pageCount })}</span>
          <button type="button" className="btn btn-ghost px-2.5 py-1.5" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label={copy.nextAria}>
            {copy.next} <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </nav>
      </div>}
    </section>
  </div>;
}
