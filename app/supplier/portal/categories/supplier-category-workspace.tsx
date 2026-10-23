"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Check, FolderTree, Info, Package, Search, X } from "lucide-react";

import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { PRODUCT_STATUS } from "@/lib/supplier-portal/product-view";

import { saveSupplierCategoriesAction } from "./actions";

/** Trần phạm vi NCC được chọn — phải khớp `parseSupplierCategoryProposals`. */
const MAX_CATEGORIES = 5;

export type WorkspaceProduct = {
  id: string;
  name: string;
  categorySlug: string | null;
  review: keyof typeof PRODUCT_STATUS;
};

/**
 * Trang "Danh mục kinh doanh" theo nhịp sàn TMĐT: dải tổng quan → lưới danh mục có ảnh
 * và số sản phẩm → cột phạm vi dính bên phải → danh sách sản phẩm đang dùng danh mục.
 *
 * Toàn bộ hành vi cũ giữ nguyên: chọn 1–5 danh mục Vexim đã mở, gửi qua
 * `saveSupplierCategoriesAction`, server vẫn là nơi kiểm tra cuối cùng (không tự
 * duyệt, không tự công khai, không cho bỏ danh mục còn sản phẩm).
 */
export function SupplierCategoryWorkspace({
  options,
  initial,
  products,
}: {
  options: CategoryProposalOption[];
  initial: string[];
  products: WorkspaceProduct[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => initial.filter((slug) => options.some((c) => c.slug === slug)));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const bySlug = useMemo(() => new Map(options.map((c) => [c.slug, c])), [options]);
  const productCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      if (!product.categorySlug) continue;
      counts.set(product.categorySlug, (counts.get(product.categorySlug) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  const atLimit = selected.length >= MAX_CATEGORIES;
  const needle = query.trim().toLocaleLowerCase("vi");
  const visible = useMemo(
    () => options.filter((c) => !needle ||
      `${c.label} ${c.group ?? ""} ${c.intro ?? ""} ${c.slug}`.toLocaleLowerCase("vi").includes(needle)),
    [options, needle],
  );
  const groups = useMemo(() => {
    const map = new Map<string, CategoryProposalOption[]>();
    for (const option of visible) {
      const key = option.group ?? "";
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()].map(([name, items]) => ({ name, items }));
  }, [visible]);

  const inScope = products.filter((p) => p.categorySlug && selected.includes(p.categorySlug));
  const outside = products.filter((p) => p.categorySlug && !selected.includes(p.categorySlug));
  const unassigned = products.filter((p) => !p.categorySlug);

  function toggle(slug: string) {
    const exists = options.some((c) => c.slug === slug);
    if (!exists) return;
    setResult(null);
    setSelected((old) => old.includes(slug)
      ? old.filter((item) => item !== slug)
      : old.length >= MAX_CATEGORIES ? old : [...old, slug]);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await saveSupplierCategoriesAction(new FormData(event.currentTarget));
      setResult(response);
      if (response.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "Không kết nối được máy chủ." });
    } finally {
      setBusy(false);
    }
  }

  const summary = [
    { key: "picked", label: "Danh mục đã chọn", value: `${selected.length}/${MAX_CATEGORIES}`, note: "Tối đa 5 danh mục", icon: FolderTree, tone: "text-brand-700" },
    { key: "open", label: "Vexim đang mở", value: String(options.length), note: "Chỉ chọn trong danh sách này", icon: ArrowRight, tone: "text-ink-500" },
    { key: "inside", label: "Sản phẩm trong phạm vi", value: String(inScope.length), note: `Trên ${products.length} sản phẩm`, icon: Package, tone: "text-emerald-700" },
    { key: "outside", label: "Sản phẩm ngoài phạm vi", value: String(outside.length), note: outside.length ? "Cần chuyển trước khi bỏ danh mục" : "Không có", icon: Info, tone: outside.length ? "text-amber-700" : "text-ink-500" },
  ];

  return <form onSubmit={submit} className="space-y-4">
    <section aria-label="Tổng quan phạm vi kinh doanh" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {summary.map((item) => <div key={item.key} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-ink-600">{item.label}</p>
          <item.icon className={`size-4 ${item.tone}`} aria-hidden="true" />
        </div>
        <p className="mt-2 text-2xl font-black text-ink-900">{item.value}</p>
        <p className="mt-0.5 text-[11px] text-ink-500">{item.note}</p>
      </div>)}
    </section>

    {result && <p role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-[13px] font-semibold ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      <Check className={`mt-0.5 size-4 shrink-0 ${result.ok ? "" : "hidden"}`} aria-hidden="true" />
      <Info className={`mt-0.5 size-4 shrink-0 ${result.ok ? "hidden" : ""}`} aria-hidden="true" />
      <span>{result.message}</span>
    </p>}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="category-catalog-title" className="rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="border-b border-ink-100 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 id="category-catalog-title" className="text-lg font-black text-ink-900">Danh mục Vexim đã mở</h2>
                <p className="mt-1 text-xs text-ink-500">Bấm vào một danh mục để thêm hoặc bỏ. Danh mục đang có sản phẩm hiện kèm số lượng.</p>
              </div>
              <p className="text-[11px] font-semibold text-ink-500">Hiển thị {visible.length}/{options.length}</p>
            </div>
            <label className="relative mt-3 block max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <span className="sr-only">Tìm danh mục</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm danh mục, nhóm ngành…" className="input pl-9" />
            </label>
          </div>

          <div className="px-4 py-4 sm:px-5">
            {visible.length === 0
              ? <p className="rounded-lg bg-ink-50 px-3 py-6 text-center text-sm text-ink-600">Không có danh mục nào khớp “{query.trim()}”.</p>
              : <div className="space-y-5">
                {groups.map((group) => <div key={group.name || "root"}>
                  {group.name && <h3 className="mb-2 text-[11px] font-bold tracking-[0.12em] text-ink-400 uppercase">{group.name}</h3>}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {group.items.map((category) => {
                      const isSelected = selected.includes(category.slug);
                      const blocked = !isSelected && atLimit;
                      const count = productCounts.get(category.slug) ?? 0;
                      return <button key={category.slug} type="button" onClick={() => toggle(category.slug)}
                        disabled={blocked} aria-pressed={isSelected}
                        title={blocked ? "Đã chọn đủ 5 danh mục — bỏ một danh mục để thêm" : undefined}
                        className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition ${isSelected ? "border-brand-500 ring-2 ring-brand-200" : "border-ink-200 hover:border-brand-300 hover:shadow-sm"} ${blocked ? "cursor-not-allowed opacity-50" : ""}`}>
                        <span className="relative block aspect-[16/10] w-full overflow-hidden bg-brand-50">
                          {category.hero_image
                            ? <img src={category.hero_image} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                            : <span aria-hidden="true" className="flex size-full items-center justify-center bg-gradient-to-br from-brand-100 via-brand-50 to-ink-100 text-2xl font-black text-brand-800">
                              {category.label.slice(0, 1).toLocaleUpperCase("vi")}
                            </span>}
                          {isSelected && <span className="absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-full bg-brand-700 text-white shadow">
                            <Check className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">Đã chọn</span>
                          </span>}
                          {count > 0 && <span className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold text-ink-700 shadow-sm">{count} sản phẩm</span>}
                        </span>
                        <span className="block min-w-0 px-3 py-2.5">
                          <span className="block truncate text-[13px] font-bold text-ink-900">{category.label}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-ink-500">{category.group ?? category.intro ?? "Danh mục Vexim đã mở"}</span>
                        </span>
                      </button>;
                    })}
                  </div>
                </div>)}
              </div>}
          </div>
        </section>

        <section aria-labelledby="category-products-title" className="rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <h2 id="category-products-title" className="text-lg font-black text-ink-900">Sản phẩm theo danh mục</h2>
              <p className="mt-1 text-xs text-ink-500">Không bỏ được danh mục khi sản phẩm của bạn còn nằm trong đó.</p>
            </div>
            <Link href="/supplier/portal/products" className="text-xs font-bold text-brand-800 hover:underline">Quản lý sản phẩm</Link>
          </div>
          {products.length === 0
            ? <div className="flex flex-col items-start gap-2 px-4 py-6 sm:px-5">
              <p className="text-sm text-ink-600">Chưa có sản phẩm nào. Sau khi lưu danh mục, thêm sản phẩm để Vexim xét duyệt.</p>
              <Link href="/supplier/portal/products/new" className="btn btn-ghost btn-sm">Thêm sản phẩm đầu tiên</Link>
            </div>
            : <ul className="divide-y divide-ink-100">
              {products.slice(0, 6).map((product) => {
                const status = PRODUCT_STATUS[product.review] ?? PRODUCT_STATUS.draft;
                const inScopeProduct = !!product.categorySlug && selected.includes(product.categorySlug);
                return <li key={product.id} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">{product.name}</span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                    {product.categorySlug ? bySlug.get(product.categorySlug)?.label ?? product.categorySlug : "Chưa gắn danh mục"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
                  {product.categorySlug && !inScopeProduct && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Ngoài phạm vi</span>}
                </li>;
              })}
              {products.length > 6 && <li className="px-4 py-2.5 text-[11px] font-semibold text-ink-500 sm:px-5">
                và {products.length - 6} sản phẩm khác — xem đầy đủ ở mục Sản phẩm.
              </li>}
            </ul>}
          {unassigned.length > 0 && <p className="border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-500 sm:px-5">
            {unassigned.length} sản phẩm chưa gắn danh mục — mở từng sản phẩm để chọn danh mục trong phạm vi này.
          </p>}
        </section>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20">
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-black text-ink-900">Phạm vi đang chọn</h2>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{selected.length}/{MAX_CATEGORIES}</span>
          </div>
          <div role="progressbar" aria-label="Số danh mục đã chọn" aria-valuenow={selected.length} aria-valuemin={0} aria-valuemax={MAX_CATEGORIES}
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <span className="block h-full rounded-full bg-brand-700 transition-all" style={{ width: `${(selected.length / MAX_CATEGORIES) * 100}%` }} />
          </div>
          {selected.length
            ? <div className="mt-3 flex flex-wrap gap-1.5">
              {selected.map((slug) => <span key={slug} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-1 pr-1 pl-3 text-xs font-semibold text-brand-900">
                {bySlug.get(slug)?.label ?? slug}
                <button type="button" onClick={() => toggle(slug)} aria-label={`Bỏ ${bySlug.get(slug)?.label ?? slug}`}
                  className="rounded-full p-1 text-brand-800 hover:bg-brand-100">
                  <X className="size-3" aria-hidden="true" />
                </button>
                <input type="hidden" name="requested_category_slugs" value={slug} />
              </span>)}
            </div>
            : <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-600">Chưa chọn danh mục nào. Chọn ít nhất một danh mục để tạo được sản phẩm.</p>}
          {outside.length > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {outside.length} sản phẩm đang nằm ngoài phạm vi. Muốn bỏ danh mục đó, hãy chuyển sản phẩm sang danh mục còn chọn trước.
          </p>}
          <button type="submit" disabled={busy} className="btn btn-primary mt-4 hidden w-full lg:inline-flex">{busy ? "Đang lưu..." : "Lưu danh mục"}</button>
          <p className="mt-2 hidden text-[11px] text-ink-500 lg:block">Chỉ lưu phạm vi được phép chọn. Không tự duyệt hoặc công khai sản phẩm.</p>
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-4">
          <h2 className="flex items-center gap-1.5 text-[12px] font-bold text-ink-800">
            <Info className="size-3.5 text-brand-700" aria-hidden="true" />Cần biết
          </h2>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-4 text-ink-600">
            <li>Chỉ chọn được danh mục Vexim đã mở; bạn không tự tạo danh mục mới.</li>
            <li>Sản phẩm chỉ được chọn danh mục trong phạm vi này.</li>
            <li>Lưu danh mục không duyệt sản phẩm, không công khai gian hàng.</li>
            <li>Bỏ danh mục còn sản phẩm sẽ bị chặn cho tới khi chuyển sản phẩm.</li>
          </ul>
        </div>
      </aside>
    </div>

    <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:hidden">
      <span className="text-xs font-semibold text-ink-700">Đã chọn {selected.length}/{MAX_CATEGORIES} danh mục</span>
      <button type="submit" disabled={busy} className="btn btn-primary btn-sm">{busy ? "Đang lưu..." : "Lưu danh mục"}</button>
    </div>
  </form>;
}
