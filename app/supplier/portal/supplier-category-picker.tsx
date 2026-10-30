"use client";

import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

/** One Vexim-controlled dropdown. Choosing a category adds it straight away; up to five. */
export function SupplierCategoryPicker({ categories, initial = [] }: { categories: CategoryProposalOption[]; initial?: string[] }) {
  const [selected, setSelected] = useState(() => initial.filter((slug) => categories.some((c) => c.slug === slug)));
  const available = categories.filter((c) => !selected.includes(c.slug));
  const atLimit = selected.length >= 5;
  function add(slug: string) {
    if (!slug || atLimit || selected.includes(slug) || !categories.some((c) => c.slug === slug)) return;
    setSelected((old) => [...old, slug]);
  }
  return <div className="mt-4 space-y-3">
    <select aria-label="Chọn danh mục đang mở" className="input max-w-sm" value=""
      disabled={!available.length || atLimit} onChange={(event) => add(event.target.value)}>
      <option value="">{atLimit ? "Đã chọn đủ 5 danh mục" : available.length ? "Chọn danh mục…" : "Đã chọn hết danh mục đang mở"}</option>
      {available.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} · ` : ""}{c.label}</option>)}
    </select>
    <div className="flex flex-wrap gap-2">{selected.map((slug) => <span key={slug} className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900">
      {categories.find((c) => c.slug === slug)?.label ?? slug}
      <button type="button" aria-label={`Bỏ ${slug}`} className="text-rose-700 hover:underline" onClick={() => setSelected((old) => old.filter((item) => item !== slug))}>×</button>
      <input type="hidden" name="requested_category_slugs" value={slug} />
    </span>)}</div>
    <p className="text-xs text-ink-500">Đã chọn {selected.length}/5. Chọn trong ô là danh mục được thêm ngay, bấm dấu × để bỏ. Chỉ chọn được danh mục đang mở; sản phẩm của bạn phải thuộc một trong các danh mục này.</p>
  </div>;
}
