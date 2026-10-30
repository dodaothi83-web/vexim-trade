"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, FolderTree, Info, Package, Search, X } from "lucide-react";

import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { PRODUCT_STATUS } from "@/lib/supplier-portal/product-view";

import { saveSupplierCategoriesAction } from "./actions";

/** Trần phạm vi NCC được chọn - phải khớp `parseSupplierCategoryProposals`. */
const MAX_CATEGORIES = 5;

export type WorkspaceProduct = {
  id: string;
  name: string;
  categorySlug: string | null;
  review: keyof typeof PRODUCT_STATUS;
  readyForBuyer?: boolean;
};

/**
 * Trang "Danh mục kinh doanh": dải tổng quan → DANH SÁCH danh mục (không ảnh bìa, gọn
 * theo từng dòng, nhóm theo ngành) → cột phạm vi dính bên phải → danh sách sản phẩm.
 *
 * Danh mục là thứ để đọc và tích chọn, không phải để ngắm ảnh: bỏ ảnh bìa cho danh sách
 * ngắn lại một nửa và quét nhanh hơn nhiều so với lưới thẻ.
 *
 * Toàn bộ hành vi cũ giữ nguyên: chọn 1-5 danh mục Vexim đã mở, gửi qua
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
    // Danh mục gốc (không có ngành cha) đứng đầu, sau đó theo thứ tự CMS.
    return [...map.entries()]
      .sort(([a], [b]) => (a === b ? 0 : a === "" ? -1 : b === "" ? 1 : 0))
      .map(([name, items]) => ({ name, items }));
  }, [visible]);

  const inScope = products.filter((p) => p.categorySlug && selected.includes(p.categorySlug));
  const outside = products.filter((p) => p.categorySlug && !selected.includes(p.categorySlug));
  const unassigned = products.filter((p) => !p.categorySlug);

  function toggle(slug: string) {
    if (!options.some((c) => c.slug === slug)) return;
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
    { key: "picked", label: "Đã chọn", value: `${selected.length}/${MAX_CATEGORIES}`, note: "Tối đa 5 danh mục" },
    { key: "open", label: "Danh mục đang mở", value: String(options.length), note: "Chỉ chọn trong danh sách này" },
    { key: "inside", label: "Sản phẩm trong phạm vi", value: `${inScope.length}/${products.length}`, note: "Đang thuộc danh mục đã chọn" },
    { key: "outside", label: "Sản phẩm ngoài phạm vi", value: String(outside.length), note: outside.length ? "Cần chuyển trước khi bỏ danh mục" : "Không có" },
  ];

  return <form onSubmit={submit} className="space-y-4">
    <section aria-label="Tổng quan phạm vi kinh doanh" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {summary.map((item) => <div key={item.key} className="rounded-lg border border-ink-200 bg-white px-3.5 py-3">
        <p className="text-[11px] font-semibold text-ink-600">{item.label}</p>
        <p className="mt-0.5 text-xl leading-tight font-black text-ink-900">{item.value}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-500">{item.note}</p>
      </div>)}
    </section>

    {result && <p role="status" className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] font-semibold ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      {result.ok
        ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        : <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      <span>{result.message}</span>
    </p>}

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
      <div className="min-w-0 space-y-4">
        <section aria-labelledby="category-catalog-title" className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3.5">
            <div className="min-w-0">
              <h2 id="category-catalog-title" className="text-base font-black text-ink-900">Danh mục đang mở</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-500">Bấm vào một dòng để thêm hoặc bỏ. Số bên phải là sản phẩm đang dùng danh mục đó.</p>
            </div>
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <span className="sr-only">Tìm danh mục</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm danh mục…" className="input py-1.5 pl-8 text-[13px]" />
            </label>
          </div>

          {visible.length === 0
            ? <p className="bg-ink-50 px-4 py-8 text-center text-sm text-ink-600">Không có danh mục nào khớp “{query.trim()}”.</p>
            : <div>
              {groups.map((group) => {
                const chosenInGroup = group.items.filter((c) => selected.includes(c.slug)).length;
                return <div key={group.name || "root"} className="border-b border-ink-100 last:border-b-0">
                  <div className="flex items-center justify-between gap-2 bg-ink-50/70 px-4 py-1.5">
                    <h3 className="text-[10.5px] font-bold tracking-[0.12em] text-ink-500 uppercase">{group.name || "Danh mục chính"}</h3>
                    <span className="text-[10.5px] font-semibold text-ink-400">{chosenInGroup ? `${chosenInGroup} đã chọn · ` : ""}{group.items.length} danh mục</span>
                  </div>
                  <ul className="divide-y divide-ink-100">
                    {group.items.map((category) => {
                      const isSelected = selected.includes(category.slug);
                      const blocked = !isSelected && atLimit;
                      const count = productCounts.get(category.slug) ?? 0;
                      return <li key={category.slug}>
                        <button type="button" onClick={() => toggle(category.slug)} disabled={blocked}
                          aria-pressed={isSelected}
                          title={blocked ? "Đã chọn đủ 5 danh mục - bỏ một danh mục để thêm" : undefined}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${blocked ? "cursor-not-allowed opacity-45" : "hover:bg-brand-50/60"} ${isSelected ? "bg-brand-50/80" : ""}`}>
                          <span aria-hidden="true" className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${isSelected ? "border-brand-700 bg-brand-700 text-white" : "border-ink-300 bg-white"}`}>
                            {isSelected && <Check className="size-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] ${isSelected ? "font-bold text-brand-900" : "font-semibold text-ink-900"}`}>{category.label}</span>
                            {category.intro && <span className="mt-0.5 block truncate text-[11px] text-ink-500">{category.intro}</span>}
                          </span>
                          {count > 0 && <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">{count} sản phẩm</span>}
                          <span className="sr-only">{isSelected ? "Đã chọn" : "Chưa chọn"}</span>
                        </button>
                      </li>;
                    })}
                  </ul>
                </div>;
              })}
              <p className="border-t border-ink-100 px-4 py-2 text-[11px] font-semibold text-ink-500">Hiển thị {visible.length}/{options.length} danh mục</p>
            </div>}
        </section>

        <section aria-labelledby="category-products-title" className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3.5">
            <div className="min-w-0">
              <h2 id="category-products-title" className="text-base font-black text-ink-900">Sản phẩm theo danh mục</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-500">Không bỏ được danh mục khi sản phẩm của bạn còn nằm trong đó.</p>
            </div>
            <Link href="/supplier/portal/products" className="text-xs font-bold text-brand-800 hover:underline">Quản lý sản phẩm</Link>
          </div>
          {products.length === 0
            ? <div className="flex flex-wrap items-center gap-3 px-4 py-5">
              <p className="flex-1 text-sm text-ink-600">Chưa có sản phẩm nào. Sau khi lưu danh mục, thêm sản phẩm để gửi duyệt.</p>
              <Link href="/supplier/portal/products/new" className="btn btn-ghost btn-sm">Thêm sản phẩm đầu tiên</Link>
            </div>
            : <ul className="divide-y divide-ink-100">
              {products.slice(0, 6).map((product) => {
                const status = PRODUCT_STATUS[product.review] ?? PRODUCT_STATUS.draft;
                const statusLabel = product.review === "approved" && product.readyForBuyer === false ? "Đã duyệt, chờ đăng" : status.label;
                const inScopeProduct = !!product.categorySlug && selected.includes(product.categorySlug);
                return <li key={product.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">{product.name}</span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                    {product.categorySlug ? bySlug.get(product.categorySlug)?.label ?? product.categorySlug : "Chưa gắn danh mục"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}>{statusLabel}</span>
                  {product.categorySlug && !inScopeProduct && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Ngoài phạm vi</span>}
                </li>;
              })}
              {products.length > 6 && <li className="px-4 py-2 text-[11px] font-semibold text-ink-500">
                và {products.length - 6} sản phẩm khác - xem đầy đủ ở mục Sản phẩm.
              </li>}
            </ul>}
          {unassigned.length > 0 && <p className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-500">
            {unassigned.length} sản phẩm chưa gắn danh mục - mở từng sản phẩm để chọn danh mục đang xuất bản.
          </p>}
        </section>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20">
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-black text-ink-900">
              <FolderTree className="size-4 text-brand-700" aria-hidden="true" />Phạm vi đang chọn
            </h2>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{selected.length}/{MAX_CATEGORIES}</span>
          </div>
          <div role="progressbar" aria-label="Số danh mục đã chọn" aria-valuenow={selected.length} aria-valuemin={0} aria-valuemax={MAX_CATEGORIES}
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <span className="block h-full rounded-full bg-brand-700 transition-all" style={{ width: `${(selected.length / MAX_CATEGORIES) * 100}%` }} />
          </div>
          {selected.length
            ? <ul className="mt-2.5 divide-y divide-ink-100">
              {selected.map((slug) => <li key={slug} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-900">{bySlug.get(slug)?.label ?? slug}</span>
                <button type="button" onClick={() => toggle(slug)} aria-label={`Bỏ ${bySlug.get(slug)?.label ?? slug}`}
                  className="rounded-full p-1 text-ink-500 hover:bg-rose-50 hover:text-rose-700">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
                <input type="hidden" name="requested_category_slugs" value={slug} />
              </li>)}
            </ul>
            : <p className="mt-2.5 rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-600">Chưa chọn danh mục nào. Chọn ít nhất một danh mục để tạo được sản phẩm.</p>}
          {outside.length > 0 && <p className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {outside.length} sản phẩm đang nằm ngoài phạm vi. Muốn bỏ danh mục đó, hãy chuyển sản phẩm sang danh mục còn chọn trước.
          </p>}
          <button type="submit" disabled={busy} className="btn btn-primary mt-3 hidden w-full lg:inline-flex">{busy ? "Đang lưu..." : "Lưu danh mục"}</button>
          <p className="mt-1.5 hidden text-[11px] text-ink-500 lg:block">Chỉ lưu phạm vi bán hàng. Việc đăng sản phẩm diễn ra ở bước duyệt.</p>
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-4">
          <h2 className="flex items-center gap-1.5 text-[12px] font-bold text-ink-800">
            <Info className="size-3.5 text-brand-700" aria-hidden="true" />Cần biết
          </h2>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-4 text-ink-600">
            <li>Chỉ chọn được danh mục đang mở; bạn không tự tạo danh mục mới.</li>
            <li>Phạm vi này là thông tin tham khảo khi staff duyệt sản phẩm.</li>
            <li>Lưu danh mục không duyệt sản phẩm, không công khai gian hàng.</li>
            <li>Bỏ danh mục còn sản phẩm sẽ bị chặn cho tới khi chuyển sản phẩm.</li>
          </ul>
        </div>

        <div className="hidden rounded-xl border border-ink-200 bg-white p-3.5 lg:block">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-600">
            <Package className="size-3.5 text-brand-700" aria-hidden="true" />{products.length} sản phẩm trong gian hàng
          </p>
          <Link href="/supplier/portal/products" className="mt-1.5 block text-[12px] font-bold text-brand-800 hover:underline">Sang trang Sản phẩm →</Link>
        </div>
      </aside>
    </div>

    <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:hidden">
      <span className="text-xs font-semibold text-ink-700">Đã chọn {selected.length}/{MAX_CATEGORIES} danh mục</span>
      <button type="submit" disabled={busy} className="btn btn-primary btn-sm">{busy ? "Đang lưu..." : "Lưu danh mục"}</button>
    </div>
  </form>;
}
