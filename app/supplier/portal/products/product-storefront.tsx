"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Clock3, FileText, ImageIcon, PackagePlus, Plus, Search, SlidersHorizontal } from "lucide-react";
import type { MediaAsset, SupplierProduct } from "@/lib/types";
import { PRODUCT_STATUS, SUPPLIER_PRODUCTS_PER_PAGE, privateMediaUrl, productReview, supplierProductPage, type ProductReviewFilter } from "@/lib/supplier-portal/product-view";

const FILTERS: { id: ProductReviewFilter; label: string }[] = [
  { id: "all", label: "Tất cả" }, { id: "draft", label: "Bản nháp" },
  { id: "pending", label: "Chờ duyệt" }, { id: "changes_requested", label: "Cần sửa" },
  { id: "approved", label: "Đã đăng" },
];

function money(product: SupplierProduct) {
  if (product.ref_price == null) return null;
  const format = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
  const range = product.ref_price_max != null && product.ref_price_max > product.ref_price ? `-${format(product.ref_price_max)}` : "";
  return `${format(product.ref_price)}${range} ${product.currency || "USD"}${product.unit ? ` / ${product.unit}` : ""}`;
}

export function SupplierProductStorefront({ products, media, supplierPublished, categoryLabels = {}, scope }: {
  products: SupplierProduct[]; media: MediaAsset[]; supplierPublished: boolean;
  /** Nhãn danh mục tiếng Việt theo slug - để thẻ sản phẩm không hiện slug thô. */
  categoryLabels?: Record<string, string>;
  /** Phạm vi danh mục NCC được chọn; sản phẩm ngoài phạm vi bị đánh dấu rõ. */
  scope?: string[];
}) {
  const [filter, setFilter] = useState<ProductReviewFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [page, setPage] = useState(1);
  const mediaByProduct = useMemo(() => {
    const grouped = new Map<string, MediaAsset[]>();
    for (const asset of media) if (asset.product_id) grouped.set(asset.product_id, [...(grouped.get(asset.product_id) ?? []), asset]);
    return grouped;
  }, [media]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, f.id === "all" ? products.length : products.filter((p) => productReview(p) === f.id).length])), [products]);
  const label = (slug: string | null) => slug ? categoryLabels[slug] ?? slug : "Chưa gắn danh mục";
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

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-[0.16em] text-brand-700 uppercase">Cổng nhà cung cấp · riêng tư</p>
        <h1 className="mt-1 text-[22px] leading-tight font-black tracking-tight text-ink-900">Sản phẩm của tôi</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-ink-500">Tạo hồ sơ mặt hàng, thêm ảnh thực tế và gửi duyệt. Đây là khu vực riêng của bạn, không phải trang hiển thị cho buyer.</p>
      </div>
      <Link href="/supplier/portal/products/new" className="btn btn-primary"><Plus className="size-4" aria-hidden="true" /> Thêm sản phẩm</Link>
    </header>

    {outsideScope.length > 0 && <p className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
      <span className="font-bold">{outsideScope.length} sản phẩm nằm ngoài phạm vi danh mục</span>
      <span className="text-amber-800">Các sản phẩm này chưa gắn với danh mục bạn đã đăng ký.</span>
      <Link href="/supplier/portal/categories" className="font-bold underline">Chọn thêm danh mục</Link>
    </p>}

    {/* 5 thẻ stat gọn trên cùng một hàng: icon chip màu theo trạng thái (khớp nhãn lưới bên dưới), số nhỏ để bớt thô. */}
    <section aria-label="Tổng quan sản phẩm" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {[
        { label: "Tổng sản phẩm", value: counts.all, icon: PackagePlus, tone: "bg-brand-50 text-brand-700" },
        { label: "Bản nháp", value: counts.draft, icon: FileText, tone: "bg-slate-100 text-slate-700" },
        { label: "Chờ duyệt", value: counts.pending, icon: Clock3, tone: "bg-amber-100 text-amber-900" },
        { label: "Cần chỉnh sửa", value: counts.changes_requested, icon: SlidersHorizontal, tone: "bg-rose-100 text-rose-800" },
        { label: "Đã đăng", value: counts.approved, icon: BadgeCheck, tone: "bg-emerald-100 text-emerald-800" },
      ].map((item) => <div key={item.label} className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-3.5 py-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${item.tone}`}><item.icon className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0"><p className="truncate text-[11px] font-semibold text-ink-600">{item.label}</p>
          <p className="text-xl font-black leading-tight text-ink-900">{item.value}</p></span>
      </div>)}
    </section>

    <section aria-label="Danh sách sản phẩm" className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="border-b border-ink-100 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-ink-900">Danh mục của bạn</h2>
          <p className="mt-1 text-xs text-ink-600">Sau khi duyệt, sản phẩm được đăng và bạn có thể quản lý thông tin, hình ảnh.</p></div>
          {!supplierPublished && <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Trang NCC chưa được công khai</span>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[180px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <span className="sr-only">Tìm sản phẩm của tôi</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm tên, mô tả, quy cách..." className="input pl-10" /></label>
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-ink-600"><span>Sắp xếp</span><select className="input min-w-[132px]" value={sort} onChange={(e) => { setSort(e.target.value as "recent" | "name"); setPage(1); }}><option value="recent">Mới cập nhật</option><option value="name">Tên A-Z</option></select></label>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Lọc trạng thái sản phẩm">{FILTERS.map((tab) =>
          <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => { setFilter(tab.id); setPage(1); }}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition ${filter === tab.id ? "bg-brand-800 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>{tab.label} <span className={filter === tab.id ? "text-brand-100" : "text-ink-500"}>{counts[tab.id]}</span></button>)}</div>
      </div>
      {visible.length ? <ul className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3 xl:grid-cols-4">{shown.map((p) => {
        const assets = mediaByProduct.get(p.id) ?? [];
        const image = assets.find((m) => m.id === p.featured_media_id && m.kind === "image" && m.audience === "buyer" && privateMediaUrl(m)) ??
          assets.find((m) => m.kind === "image" && privateMediaUrl(m));
        const imageSrc = image && privateMediaUrl(image);
        const status = PRODUCT_STATUS[productReview(p)];
        const statusLabel = productReview(p) === "approved" && !p.ready_for_buyer ? "Đã duyệt, chờ đăng" : status.label;
        return <li key={p.id} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-brand-300 hover:shadow-md">
          <Link href={`/supplier/portal/products/${p.id}`} aria-label={`Xem và quản lý ${p.name}`} className="relative block aspect-square overflow-hidden bg-gradient-to-br from-ink-100 via-brand-50 to-ink-100">
            {imageSrc ? <img src={imageSrc} alt={`Ảnh sản phẩm ${p.name}`} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              : <div className="flex size-full flex-col items-center justify-center gap-3 text-ink-400"><ImageIcon className="size-12 stroke-1" aria-hidden="true" /><span className="text-xs font-semibold">Chưa có ảnh sản phẩm</span></div>}
            <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold shadow-sm ${status.tone}`}>{statusLabel}</span>
          </Link>
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold tracking-wider text-brand-700 uppercase">
              {label(p.category)}
              {scope && p.category && !scope.includes(p.category) && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] normal-case text-amber-900">Ngoài phạm vi</span>}
            </p>
            <Link href={`/supplier/portal/products/${p.id}`} className="mt-1 line-clamp-2 text-lg font-bold text-ink-900 hover:text-brand-700">{p.name}</Link>
            <p className="mt-2 line-clamp-2 min-h-10 text-sm text-ink-600">{p.spec || p.description || "Thêm quy cách hoặc mô tả để buyer hiểu rõ sản phẩm."}</p>
            <div className="mt-4 flex items-end justify-between gap-2 border-t border-ink-100 pt-4">
              <div>{money(p) ? <><p className="text-[11px] text-ink-500">Giá tham khảo · tự khai</p><p className="text-sm font-bold text-ink-900">{money(p)}</p></> : <p className="text-xs text-ink-500">Chưa nhập giá tham khảo</p>}
                {p.moq && <p className="mt-1 line-clamp-1 text-xs text-ink-500">MOQ: {p.moq}</p>}</div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition group-hover:bg-brand-700 group-hover:text-white"><ArrowRight className="size-4" aria-hidden="true" /></span>
            </div>
            {p.supplier_review_note && <p className="mt-3 line-clamp-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">Góp ý: {p.supplier_review_note}</p>}
          </div>
        </li>;
      })}</ul> : <div className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><PackagePlus className="size-8" aria-hidden="true" /></div>
        <h3 className="mt-4 text-lg font-bold text-ink-900">{products.length ? "Không tìm thấy sản phẩm phù hợp" : "Bắt đầu với sản phẩm đầu tiên"}</h3>
        <p className="mt-2 text-sm leading-6 text-ink-600">{products.length ? "Thử từ khóa khác hoặc đổi bộ lọc trạng thái." : "Tạo sản phẩm, lưu bản nháp, tải ảnh hoặc catalogue thật rồi gửi duyệt."}</p>
        {products.length === 0 && <Link href="/supplier/portal/products/new" className="btn btn-primary mt-5"><Plus className="size-4" aria-hidden="true" /> Thêm sản phẩm</Link>}
        {products.length > 0 && <button type="button" onClick={() => { setFilter("all"); setQuery(""); setPage(1); }} className="mt-5 text-sm font-semibold text-brand-700 underline">Xóa bộ lọc</button>}
      </div>}
      {pageCount > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 sm:px-6">
        <p className="text-[11.5px] text-ink-500">Hiển thị {firstItem}-{lastItem} trong {visible.length} sản phẩm. Mỗi trang tối đa {SUPPLIER_PRODUCTS_PER_PAGE} sản phẩm.</p>
        <nav aria-label="Phân trang danh sách sản phẩm" className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost px-2.5 py-1.5" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Trang trước">
            <ChevronLeft className="size-4" aria-hidden="true" /> Trước
          </button>
          <span className="min-w-[84px] text-center text-[12px] text-ink-600" aria-live="polite">Trang {currentPage} / {pageCount}</span>
          <button type="button" className="btn btn-ghost px-2.5 py-1.5" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Trang sau">
            Sau <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </nav>
      </div>}
    </section>
  </div>;
}
