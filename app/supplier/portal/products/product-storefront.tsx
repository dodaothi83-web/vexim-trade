"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Clock3, FileText, ImageIcon, PackagePlus, Plus, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import type { MediaAsset, SupplierProduct } from "@/lib/types";
import { PRODUCT_STATUS, privateMediaUrl, productReview, type ProductReviewFilter } from "@/lib/supplier-portal/product-view";

const FILTERS: { id: ProductReviewFilter; label: string }[] = [
  { id: "all", label: "Tất cả" }, { id: "draft", label: "Bản nháp" },
  { id: "pending", label: "Chờ duyệt" }, { id: "changes_requested", label: "Cần sửa" },
  { id: "approved", label: "Đã duyệt" },
];

function money(product: SupplierProduct) {
  if (product.ref_price == null) return null;
  const format = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);
  const range = product.ref_price_max != null && product.ref_price_max > product.ref_price ? `–${format(product.ref_price_max)}` : "";
  return `${format(product.ref_price)}${range} ${product.currency || "USD"}${product.unit ? ` / ${product.unit}` : ""}`;
}

export function SupplierProductStorefront({ products, media, supplierPublished }: {
  products: SupplierProduct[]; media: MediaAsset[]; supplierPublished: boolean;
}) {
  const [filter, setFilter] = useState<ProductReviewFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const mediaByProduct = useMemo(() => {
    const grouped = new Map<string, MediaAsset[]>();
    for (const asset of media) if (asset.product_id) grouped.set(asset.product_id, [...(grouped.get(asset.product_id) ?? []), asset]);
    return grouped;
  }, [media]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, f.id === "all" ? products.length : products.filter((p) => productReview(p) === f.id).length])), [products]);
  const visible = useMemo(() => products.filter((p) =>
    (filter === "all" || productReview(p) === filter) &&
    `${p.name} ${p.spec ?? ""} ${p.description ?? ""}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi")))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "vi") :
      (Date.parse(b.updated_at ?? "") || 0) - (Date.parse(a.updated_at ?? "") || 0)), [products, filter, query, sort]);

  return <div className="mt-7 space-y-7">
    <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-slate-950 via-teal-950 to-teal-800 p-6 text-white shadow-lg sm:p-9">
      <div className="pointer-events-none absolute -right-14 -top-20 size-72 rounded-full border border-white/10 bg-white/5" aria-hidden="true" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-teal-100"><Sparkles className="size-3.5" aria-hidden="true" /> Trung tâm sản phẩm</span>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Quản lý sản phẩm dễ như gian hàng.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-teal-50/85">Tạo hồ sơ mặt hàng, thêm ảnh thực tế và gửi Vexim xét duyệt. Đây là khu vực riêng của bạn, không phải trang hiển thị cho buyer.</p>
        </div>
        <Link href="/supplier/portal/products/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-teal-900 shadow-sm transition hover:bg-teal-50"><Plus className="size-4" aria-hidden="true" /> Thêm sản phẩm mới</Link>
      </div>
    </section>

    <section aria-label="Tổng quan sản phẩm" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        { label: "Tổng sản phẩm", value: counts.all, icon: PackagePlus, note: "Trong gian hàng riêng" },
        { label: "Bản nháp", value: counts.draft, icon: FileText, note: "Chưa gửi Vexim" },
        { label: "Đang chờ duyệt", value: counts.pending, icon: Clock3, note: "Vexim đang kiểm tra" },
        { label: "Cần chỉnh sửa", value: counts.changes_requested, icon: SlidersHorizontal, note: "Xem góp ý của Vexim" },
      ].map((item) => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-600">{item.label}</p><item.icon className="size-4 text-teal-700" aria-hidden="true" /></div>
        <p className="mt-3 text-3xl font-black text-slate-900">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.note}</p>
      </div>)}
    </section>

    <section aria-label="Danh sách sản phẩm" className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900">Danh mục của bạn</h2>
          <p className="mt-1 text-xs text-slate-600">Duyệt nội dung ≠ đã xuất hiện công khai. Việc chia sẻ buyer còn tùy trang NCC, danh mục và tệp Vexim chọn.</p></div>
          {!supplierPublished && <span className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Trang NCC chưa được công khai</span>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[180px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <span className="sr-only">Tìm sản phẩm của tôi</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, mô tả, quy cách..." className="input pl-10" /></label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><span>Sắp xếp</span><select className="input min-w-[132px]" value={sort} onChange={(e) => setSort(e.target.value as "recent" | "name")}><option value="recent">Mới cập nhật</option><option value="name">Tên A–Z</option></select></label>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Lọc trạng thái sản phẩm">{FILTERS.map((tab) =>
          <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition ${filter === tab.id ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{tab.label} <span className={filter === tab.id ? "text-teal-100" : "text-slate-500"}>{counts[tab.id]}</span></button>)}</div>
      </div>
      {visible.length ? <ul className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">{visible.map((p) => {
        const assets = mediaByProduct.get(p.id) ?? [];
        const image = assets.find((m) => m.id === p.featured_media_id && m.kind === "image" && m.audience === "buyer" && privateMediaUrl(m)) ??
          assets.find((m) => m.kind === "image" && privateMediaUrl(m));
        const imageSrc = image && privateMediaUrl(image);
        const status = PRODUCT_STATUS[productReview(p)];
        return <li key={p.id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-teal-300 hover:shadow-md">
          <Link href={`/supplier/portal/products/${p.id}`} aria-label={`Xem và quản lý ${p.name}`} className="relative block aspect-[4/3] overflow-hidden bg-gradient-to-br from-slate-100 via-teal-50 to-slate-100">
            {imageSrc ? <img src={imageSrc} alt={`Ảnh sản phẩm ${p.name}`} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
              : <div className="flex size-full flex-col items-center justify-center gap-3 text-slate-400"><ImageIcon className="size-12 stroke-1" aria-hidden="true" /><span className="text-xs font-semibold">Chưa có ảnh sản phẩm</span></div>}
            <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[11px] font-bold shadow-sm ${status.tone}`}>{status.label}</span>
          </Link>
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">{p.category || "Mặt hàng của bạn"}</p>
            <Link href={`/supplier/portal/products/${p.id}`} className="mt-1 line-clamp-2 text-lg font-bold text-slate-900 hover:text-teal-700">{p.name}</Link>
            <p className="mt-2 line-clamp-2 min-h-10 text-sm text-slate-600">{p.spec || p.description || "Thêm quy cách hoặc mô tả để buyer hiểu rõ sản phẩm."}</p>
            <div className="mt-4 flex items-end justify-between gap-2 border-t border-slate-100 pt-4">
              <div>{money(p) ? <><p className="text-[11px] text-slate-500">Giá tham khảo · tự khai</p><p className="text-sm font-bold text-slate-900">{money(p)}</p></> : <p className="text-xs text-slate-500">Chưa nhập giá tham khảo</p>}
                {p.moq && <p className="mt-1 line-clamp-1 text-xs text-slate-500">MOQ: {p.moq}</p>}</div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 transition group-hover:bg-teal-700 group-hover:text-white"><ArrowRight className="size-4" aria-hidden="true" /></span>
            </div>
            {p.supplier_review_note && <p className="mt-3 line-clamp-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">Vexim: {p.supplier_review_note}</p>}
            {p.ready_for_buyer && productReview(p) === "approved" && <p className="mt-3 text-xs font-medium text-teal-800">Vexim đã bật sẵn sàng gửi buyer · không khẳng định đã công khai</p>}
          </div>
        </li>;
      })}</ul> : <div className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><PackagePlus className="size-8" aria-hidden="true" /></div>
        <h3 className="mt-4 text-lg font-bold text-slate-900">{products.length ? "Không tìm thấy sản phẩm phù hợp" : "Bắt đầu với sản phẩm đầu tiên"}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{products.length ? "Thử từ khóa khác hoặc đổi bộ lọc trạng thái." : "Tạo sản phẩm, lưu bản nháp, tải ảnh hoặc catalogue thật rồi gửi Vexim kiểm tra."}</p>
        {products.length === 0 && <Link href="/supplier/portal/products/new" className="btn btn-primary mt-5"><Plus className="size-4" aria-hidden="true" /> Thêm sản phẩm</Link>}
        {products.length > 0 && <button type="button" onClick={() => { setFilter("all"); setQuery(""); }} className="mt-5 text-sm font-semibold text-teal-700 underline">Xóa bộ lọc</button>}
      </div>}
    </section>
  </div>;
}
