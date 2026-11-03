"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, FolderTree, Info, Package, Search, X } from "lucide-react";

import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import type { CategoriesMessages } from "@/lib/i18n/portal/categories";
import { PRODUCT_STATUS } from "@/lib/supplier-portal/product-view";
import type { ProductsMessages } from "@/lib/i18n/portal/products";
import { fill } from "@/lib/i18n/format";

import { saveSupplierCategoriesAction } from "./actions";

/** Trần phạm vi NCC được chọn - phải khớp `parseSupplierCategoryProposals`. */
const MAX_CATEGORIES = 5;

export type WorkspaceProduct = {
  id: string;
  name: string;
  categorySlug: string | null;
  review: keyof ProductsMessages["statuses"];
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
  copy,
  statuses,
  options,
  initial,
  products,
}: {
  copy: CategoriesMessages;
  statuses: ProductsMessages["statuses"];
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
      setResult({ ok: false, message: copy.errors.offline });
    } finally {
      setBusy(false);
    }
  }

  const summary = [
    { key: "picked", label: copy.summary.picked, value: `${selected.length}/${MAX_CATEGORIES}`, note: copy.summary.pickedNote },
    { key: "open", label: copy.summary.open, value: String(options.length), note: copy.summary.openNote },
    { key: "inside", label: copy.summary.inside, value: `${inScope.length}/${products.length}`, note: copy.summary.insideNote },
    { key: "outside", label: copy.summary.outside, value: String(outside.length), note: outside.length ? copy.summary.outsideNote : copy.summary.outsideNone },
  ];

  return <form onSubmit={submit} className="space-y-4">
    <section aria-label={copy.summary.aria} className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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
              <h2 id="category-catalog-title" className="text-base font-black text-ink-900">{copy.catalog.title}</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-500">{copy.catalog.sub}</p>
            </div>
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
              <span className="sr-only">{copy.catalog.search}</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.catalog.placeholder} className="input py-1.5 pl-8 text-[13px]" />
            </label>
          </div>

          {visible.length === 0
            ? <p className="bg-ink-50 px-4 py-8 text-center text-sm text-ink-600">{fill(copy.catalog.noMatch, { query: query.trim() })}</p>
            : <div>
              {groups.map((group) => {
                const chosenInGroup = group.items.filter((c) => selected.includes(c.slug)).length;
                return <div key={group.name || "root"} className="border-b border-ink-100 last:border-b-0">
                  <div className="flex items-center justify-between gap-2 bg-ink-50/70 px-4 py-1.5">
                    <h3 className="text-[10.5px] font-bold tracking-[0.12em] text-ink-500 uppercase">{group.name || copy.catalog.rootGroup}</h3>
                    <span className="text-[10.5px] font-semibold text-ink-400">{chosenInGroup ? fill(copy.catalog.groupPicked, { count: chosenInGroup }) : ""}{fill(copy.catalog.groupCount, { count: group.items.length })}</span>
                  </div>
                  <ul className="divide-y divide-ink-100">
                    {group.items.map((category) => {
                      const isSelected = selected.includes(category.slug);
                      const blocked = !isSelected && atLimit;
                      const count = productCounts.get(category.slug) ?? 0;
                      return <li key={category.slug}>
                        <button type="button" onClick={() => toggle(category.slug)} disabled={blocked}
                          aria-pressed={isSelected}
                          title={blocked ? copy.catalog.blockedTitle : undefined}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${blocked ? "cursor-not-allowed opacity-45" : "hover:bg-brand-50/60"} ${isSelected ? "bg-brand-50/80" : ""}`}>
                          <span aria-hidden="true" className={`flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition ${isSelected ? "border-brand-700 bg-brand-700 text-white" : "border-ink-300 bg-white"}`}>
                            {isSelected && <Check className="size-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[13px] ${isSelected ? "font-bold text-brand-900" : "font-semibold text-ink-900"}`}>{category.label}</span>
                            {category.intro && <span className="mt-0.5 block truncate text-[11px] text-ink-500">{category.intro}</span>}
                          </span>
                          {count > 0 && <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-semibold text-ink-700">{fill(copy.catalog.perCategory, { count })}</span>}
                          <span className="sr-only">{isSelected ? copy.catalog.picked : copy.catalog.unpicked}</span>
                        </button>
                      </li>;
                    })}
                  </ul>
                </div>;
              })}
              <p className="border-t border-ink-100 px-4 py-2 text-[11px] font-semibold text-ink-500">{fill(copy.catalog.shown, { shown: visible.length, total: options.length })}</p>
            </div>}
        </section>

        <section aria-labelledby="category-products-title" className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3.5">
            <div className="min-w-0">
              <h2 id="category-products-title" className="text-base font-black text-ink-900">{copy.products.title}</h2>
              <p className="mt-0.5 text-[11.5px] text-ink-500">{copy.products.sub}</p>
            </div>
            <Link href="/supplier/portal/products" className="text-xs font-bold text-brand-800 hover:underline">{copy.products.manage}</Link>
          </div>
          {products.length === 0
            ? <div className="flex flex-wrap items-center gap-3 px-4 py-5">
              <p className="flex-1 text-sm text-ink-600">{copy.products.empty}</p>
              <Link href="/supplier/portal/products/new" className="btn btn-ghost btn-sm">{copy.products.addFirst}</Link>
            </div>
            : <ul className="divide-y divide-ink-100">
              {products.slice(0, 6).map((product) => {
                const statusLabel = product.review === "approved" && product.readyForBuyer === false
                  ? copy.products.pendingPublish : statuses[product.review] ?? copy.products.pendingPublish;
                const inScopeProduct = !!product.categorySlug && selected.includes(product.categorySlug);
                return <li key={product.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-900">{product.name}</span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                    {product.categorySlug ? bySlug.get(product.categorySlug)?.label ?? product.categorySlug : copy.products.noCategory}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${(PRODUCT_STATUS[product.review] ?? PRODUCT_STATUS.draft).tone}`}>{statusLabel}</span>
                  {product.categorySlug && !inScopeProduct && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{copy.products.outside}</span>}
                </li>;
              })}
              {products.length > 6 && <li className="px-4 py-2 text-[11px] font-semibold text-ink-500">
                {fill(copy.products.more, { count: products.length - 6 })}
              </li>}
            </ul>}
          {unassigned.length > 0 && <p className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-500">
            {fill(copy.products.unassigned, { count: unassigned.length })}
          </p>}
        </section>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20">
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-black text-ink-900">
              <FolderTree className="size-4 text-brand-700" aria-hidden="true" />{copy.scope.title}
            </h2>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{selected.length}/{MAX_CATEGORIES}</span>
          </div>
          <div role="progressbar" aria-label={copy.scope.aria} aria-valuenow={selected.length} aria-valuemin={0} aria-valuemax={MAX_CATEGORIES}
            className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
            <span className="block h-full rounded-full bg-brand-700 transition-all" style={{ width: `${(selected.length / MAX_CATEGORIES) * 100}%` }} />
          </div>
          {selected.length
            ? <ul className="mt-2.5 divide-y divide-ink-100">
              {selected.map((slug) => <li key={slug} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-900">{bySlug.get(slug)?.label ?? slug}</span>
                <button type="button" onClick={() => toggle(slug)} aria-label={fill(copy.scope.removeAria, { name: bySlug.get(slug)?.label ?? slug })}
                  className="rounded-full p-1 text-ink-500 hover:bg-rose-50 hover:text-rose-700">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
                <input type="hidden" name="requested_category_slugs" value={slug} />
              </li>)}
            </ul>
            : <p className="mt-2.5 rounded-lg bg-ink-50 px-3 py-2 text-[12px] text-ink-600">{copy.scope.empty}</p>}
          {outside.length > 0 && <p className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {fill(copy.scope.outside, { count: outside.length })}
          </p>}
          <button type="submit" disabled={busy} className="btn btn-primary mt-3 hidden w-full lg:inline-flex">{busy ? copy.scope.saving : copy.scope.save}</button>
          <p className="mt-1.5 hidden text-[11px] text-ink-500 lg:block">{copy.scope.saveNote}</p>
        </div>

        <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-4">
          <h2 className="flex items-center gap-1.5 text-[12px] font-bold text-ink-800">
            <Info className="size-3.5 text-brand-700" aria-hidden="true" />{copy.know.title}
          </h2>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-4 text-ink-600">
            {copy.know.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        <div className="hidden rounded-xl border border-ink-200 bg-white p-3.5 lg:block">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-600">
            <Package className="size-3.5 text-brand-700" aria-hidden="true" />{fill(copy.shop.count, { count: products.length })}
          </p>
          <Link href="/supplier/portal/products" className="mt-1.5 block text-[12px] font-bold text-brand-800 hover:underline">{copy.shop.link} →</Link>
        </div>
      </aside>
    </div>

    <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:hidden">
      <span className="text-xs font-semibold text-ink-700">{fill(copy.mobile.picked, { count: selected.length, max: MAX_CATEGORIES })}</span>
      <button type="submit" disabled={busy} className="btn btn-primary btn-sm">{busy ? copy.scope.saving : copy.scope.save}</button>
    </div>
  </form>;
}
