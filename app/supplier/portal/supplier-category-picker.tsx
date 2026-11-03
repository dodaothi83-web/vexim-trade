"use client";

import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { fill } from "@/lib/i18n/format";
import type { OnboardingMessages } from "@/lib/i18n/portal/onboarding";

/** One Vexim-controlled dropdown. Choosing a category adds it straight away; up to five. */
export function SupplierCategoryPicker({ categories, initial = [], messages: m }: {
  categories: CategoryProposalOption[];
  initial?: string[];
  messages: OnboardingMessages["picker"];
}) {
  const [selected, setSelected] = useState(() => initial.filter((slug) => categories.some((c) => c.slug === slug)));
  const available = categories.filter((c) => !selected.includes(c.slug));
  const atLimit = selected.length >= 5;
  function add(slug: string) {
    if (!slug || atLimit || selected.includes(slug) || !categories.some((c) => c.slug === slug)) return;
    setSelected((old) => [...old, slug]);
  }
  return <div className="mt-4 space-y-3">
    <select aria-label={m.aria} className="input max-w-sm" value=""
      disabled={!available.length || atLimit} onChange={(event) => add(event.target.value)}>
      <option value="">{atLimit ? m.atLimit : available.length ? m.choose : m.allChosen}</option>
      {available.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} · ` : ""}{c.label}</option>)}
    </select>
    <div className="flex flex-wrap gap-2">{selected.map((slug) => <span key={slug} className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900">
      {categories.find((c) => c.slug === slug)?.label ?? slug}
      <button type="button" aria-label={fill(m.remove, { slug })} className="text-rose-700 hover:underline" onClick={() => setSelected((old) => old.filter((item) => item !== slug))}>×</button>
      <input type="hidden" name="requested_category_slugs" value={slug} />
    </span>)}</div>
    <p className="text-xs text-ink-500">{fill(m.counter, { count: selected.length })} {m.hint} {m.note}</p>
  </div>;
}
