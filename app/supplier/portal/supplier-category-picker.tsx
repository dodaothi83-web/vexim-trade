"use client";

import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import type { CategoryRequestView } from "@/lib/supplier-portal/requested-category";
import { fill } from "@/lib/i18n/format";
import type { OnboardingMessages } from "@/lib/i18n/portal/onboarding";

/**
 * Một dropdown do Vexim kiểm soát + một ô "ngành của tôi chưa có".
 *
 * Vì sao có ô thứ hai: phạm vi bán hàng chỉ gồm danh mục Vexim đã mở, nhưng ngành của NCC có
 * thể chưa mở. Trước đây họ không chọn được gì và hồ sơ treo lại ở bước 1. Nay họ ghi ngành
 * bằng chữ, hệ thống ghi thành YÊU CẦU (không phải phạm vi) và Vexim trả lời qua email trong
 * 3 ngày làm việc. Câu hứa đó in nguyên văn ngay dưới ô, không diễn giải lại.
 */
export function SupplierCategoryPicker({ categories, initial = [], other = "", requests = [], messages: m, title, intro }: {
  title: string;
  intro: readonly string[];
  categories: CategoryProposalOption[];
  initial?: string[];
  /** Ngành NCC đã ghi bằng chữ ở lần gửi trước (chưa mở danh mục). */
  other?: string;
  /** Các yêu cầu đã gửi, để NCC thấy Vexim đã trả lời tới đâu. */
  requests?: CategoryRequestView[];
  messages: OnboardingMessages["picker"];
}) {
  const [selected, setSelected] = useState(() => initial.filter((slug) => categories.some((c) => c.slug === slug)));
  const [note, setNote] = useState(other);
  const available = categories.filter((c) => !selected.includes(c.slug));
  const atLimit = selected.length >= 5;
  function add(slug: string) {
    if (!slug || atLimit || selected.includes(slug) || !categories.some((c) => c.slug === slug)) return;
    setSelected((old) => [...old, slug]);
  }
  const labelOf = (slug: string) => categories.find((c) => c.slug === slug)?.label ?? slug;
  return <div className="space-y-3">
    <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
    <div>
    <label htmlFor="business-categories" className="mb-1 block text-sm font-semibold">{title}</label>
    <select id="business-categories" aria-label={m.aria} className="input w-full" value=""
      disabled={!available.length || atLimit} onChange={(event) => add(event.target.value)}>
      <option value="">{atLimit ? m.atLimit : available.length ? m.choose : m.allChosen}</option>
      {available.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} · ` : ""}{c.label}</option>)}
    </select>
    <div className="flex flex-wrap gap-2">{selected.map((slug) => <span key={slug} className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900">
      {labelOf(slug)}
      <button type="button" aria-label={fill(m.remove, { slug })} className="text-rose-700 hover:underline" onClick={() => setSelected((old) => old.filter((item) => item !== slug))}>×</button>
      <input type="hidden" name="requested_category_slugs" value={slug} />
    </span>)}</div>

    <p className="mt-2 text-xs text-ink-500">{fill(m.counter, { count: selected.length })} {m.hint}</p>
    {intro.map((line) => <p key={line} className="mt-1 text-xs text-ink-500">{line}</p>)}
    </div>
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{m.otherLabel}</span>
      <input name="requested_category_other" type="text" maxLength={260} value={note}
        onChange={(event) => setNote(event.target.value)} className="input"
        placeholder={m.otherPlaceholder} aria-describedby="requested-category-other-hint" />
      <span id="requested-category-other-hint" className="mt-1 block text-[11.5px] font-normal leading-snug text-ink-500">{m.otherHint}</span>
      <span className="mt-1 block rounded-lg bg-brand-50 px-3 py-2 text-[12px] font-medium leading-snug text-brand-900">{m.otherPromise}</span>
    </label>
    </div>

    {requests.length > 0 && <div className="max-w-xl rounded-lg border border-ink-200 bg-white p-3">
      <p className="text-[12.5px] font-bold text-ink-900">{m.requestsTitle}</p>
      <ul className="mt-2 space-y-1.5 text-[12px] leading-snug">
        {requests.map((request) => <li key={`${request.label}-${request.status}`} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-ink-800">{request.label}</span>
          <span className={request.status === "opened" ? "font-semibold text-emerald-700"
            : request.status === "rejected" ? "font-semibold text-rose-700" : "font-semibold text-amber-700"}>
            {m.requestStatus[request.status]}
          </span>
          {request.status === "opened" && request.categorySlug &&
            <span className="text-ink-600">{fill(m.requestOpenedIn, { category: request.categorySlug })}</span>}
          {request.status === "rejected" && request.note &&
            <span className="text-ink-600">{fill(m.requestNote, { note: request.note })}</span>}
        </li>)}
      </ul>
    </div>}


  </div>;
}
