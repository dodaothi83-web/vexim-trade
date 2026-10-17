"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Filter, ImageIcon, MapPin, ShieldCheck } from "lucide-react";

import type { PublicCategoryProduct } from "@/lib/public/product-catalog";
import { arrangeSupplierProducts } from "@/lib/public/supplier-product-order";

const CASHEW_CHIPS = [
  { label: "W180", grades: ["W180"] }, { label: "W240", grades: ["W240"] },
  { label: "W320", grades: ["W320"] }, { label: "W450", grades: ["W450"] },
  { label: "Splits", grades: ["WS"] }, { label: "Pieces", grades: ["LP", "SP"] },
];

function moqGroup(value: string): string {
  const text = value.toLowerCase();
  if (/fcl|container|\bcont\b|20\s*(?:ft|')/.test(text)) return "container";
  const quantity = /([\d.,]+)\s*(kg|tons?|tonnes?|mt|t)\b/i.exec(text);
  if (!quantity) return "ask";
  const number = Number(quantity[1].replace(/,/g, ""));
  if (!Number.isFinite(number)) return "ask";
  const tons = quantity[2].toLowerCase() === "kg" ? number / 1000 : number;
  return tons <= 1 ? "small" : tons <= 5 ? "medium" : "large";
}

export function CategoryProductGrid({ products, categorySlug, grades, rfqHref }: {
  products: PublicCategoryProduct[]; categorySlug: string; grades: string[]; rfqHref: string;
}) {
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [moq, setMoq] = useState("");
  const [province, setProvince] = useState("");
  const [verified, setVerified] = useState(0);
  const quick = categorySlug === "cashew" ? CASHEW_CHIPS : grades.map((g) => ({ label: g, grades: [g] }));
  const allGrades = categorySlug === "cashew" ? [...new Set([...grades, "W180", "W240", "W320", "W450", "SW", "WS", "LP", "SP"])] : grades;
  const provinces = [...new Set(products.map((p) => p.province))].sort();
  const visible = useMemo(() => products.filter((p) =>
    (!selectedGrades.length || (p.grade && selectedGrades.includes(p.grade))) &&
    (!moq || moqGroup(p.moq) === moq) &&
    (!province || p.province === province) && p.verificationLevel >= verified,
  ), [products, selectedGrades, moq, province, verified]);
  const active = selectedGrades.length > 0 || !!moq || !!province || verified > 0;
  // The initial page gives each supplier up to three cards. Filtering reveals
  // every matching offer without merging W320 listings from different companies.
  const { shown, hidden } = useMemo(() => arrangeSupplierProducts(
    visible, active ? null : new Set(visible.map((p) => p.supplierId)).size < 2 ? 2 : 3,
  ), [visible, active]);
  const reset = () => { setSelectedGrades([]); setMoq(""); setProvince(""); setVerified(0); };
  const fields = <div className="space-y-5 text-sm">
    {allGrades.length > 0 && <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-500">Grade / type</legend>
      <div className="space-y-2">{allGrades.map((g) => <label key={g} className="flex cursor-pointer items-center gap-2 text-ink-700">
        <input type="checkbox" checked={selectedGrades.includes(g)} onChange={() => setSelectedGrades((xs) => xs.includes(g) ? xs.filter((x) => x !== g) : [...xs, g])} />{g}
      </label>)}</div>
    </fieldset>}
    <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-500">Minimum order</span>
      <select className="input text-sm" value={moq} onChange={(e) => setMoq(e.target.value)}>
        <option value="">Any MOQ</option><option value="small">Up to 1 ton</option><option value="medium">Over 1–5 tons</option>
        <option value="large">Over 5 tons</option><option value="container">Full container</option><option value="ask">On request / other</option>
      </select>
    </label>
    <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-500">Province</span>
      <select className="input text-sm" value={province} onChange={(e) => setProvince(e.target.value)}>
        <option value="">All provinces</option>{provinces.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
    <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-500">Supplier verification</span>
      <select className="input text-sm" value={verified} onChange={(e) => setVerified(Number(e.target.value))}>
        <option value={0}>All suppliers</option><option value={1}>Documents checked or higher</option>
        <option value={2}>Factory visited or higher</option><option value={3}>Delivery history reviewed</option>
      </select>
    </label>
    {active && <button type="button" onClick={reset} className="font-semibold text-brand-700 underline">Clear filters</button>}
  </div>;

  return <>
    {quick.length > 0 && <div className="mt-5 flex flex-wrap gap-2" aria-label="Quick grade filters">
      {quick.map((chip) => {
        const selected = selectedGrades.length === chip.grades.length && chip.grades.every((g) => selectedGrades.includes(g));
        return <button key={chip.label} type="button" aria-pressed={selected} onClick={() => setSelectedGrades(selected ? [] : chip.grades)}
          className={"rounded-full border px-3.5 py-1.5 text-xs font-bold transition " + (selected ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-500")}>
          {chip.label}
        </button>;
      })}
    </div>}
    <div className="mt-7 grid gap-5 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block"><div className="sticky top-20 rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="mb-5 flex items-center gap-2 font-bold text-ink-900"><Filter className="h-4 w-4" /> Filter products</h2>{fields}
      </div></aside>
      <div className="min-w-0">
        <details className="mb-4 rounded-xl border border-ink-200 bg-white lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-ink-800"><span className="flex items-center gap-2"><Filter className="h-4 w-4" /> Filter products</span><ChevronDown className="h-4 w-4" /></summary>
          <div className="border-t border-ink-100 p-4">{fields}</div>
        </details>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-600"><p><strong className="text-ink-900">{shown.length}</strong> of {visible.length} products{!active && visible.length > shown.length ? " · up to 3 per supplier" : ""}</p>
          {active && <button type="button" className="text-xs font-semibold text-brand-700 underline" onClick={reset}>Show all</button>}
        </div>
        {visible.length ? <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {shown.map((p) => <article key={p.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white transition hover:border-brand-400 hover:shadow-md">
            <Link href={`/products/${encodeURIComponent(categorySlug)}/${encodeURIComponent(p.id)}`} className="group flex flex-1 flex-col" aria-label={`View ${p.name}`}>
              <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-brand-50 to-ink-100">
                {p.imagePaths[0] ? <img src={`/public-media/${p.imagePaths[0]}`} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                  : <div className="flex h-full items-center justify-center text-ink-300"><ImageIcon className="h-12 w-12" aria-hidden="true" /></div>}
                {p.isDemo && <span className="absolute left-2 top-2 rounded bg-amber-400 px-2 py-1 text-[10px] font-bold text-amber-950">DEMO</span>}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                <h3 className="line-clamp-2 min-h-10 text-sm font-bold leading-snug text-ink-900 group-hover:text-brand-700">{p.name}</h3>
                <p className="text-xs text-ink-600">MOQ <strong className="text-ink-800">{p.moq}</strong></p>
                <p className="text-sm font-bold text-brand-800">{p.price || "Price on request"}</p>
                <p className="text-xs text-ink-600">Lead time: {p.leadTimeDays !== null ? `${p.leadTimeDays} days` : "On request"}</p>
                <p className="flex items-center gap-1 text-xs text-ink-600"><MapPin className="h-3.5 w-3.5 shrink-0" />{p.province}</p>
                <p className="mt-auto flex items-center gap-1 text-[11px] font-semibold text-ink-700"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-700" />{p.verificationLabel}</p>
              </div>
            </Link>
            <div className="px-3 pb-2 text-xs text-ink-600 sm:px-4">Supplied by <Link href={`/suppliers/${encodeURIComponent(p.supplierSlug || p.supplierId)}`} className="font-semibold text-brand-700 hover:underline">{p.supplierName}</Link></div>
            <div className="px-3 pb-3 sm:px-4 sm:pb-4"><Link href={`${rfqHref}&suppliers=${encodeURIComponent(p.supplierId)}&product=${encodeURIComponent(p.name)}`}
              className="flex items-center justify-center gap-1 rounded-md bg-ink-900 px-2 py-2 text-center text-xs font-bold text-white hover:bg-brand-700">Request quote <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          </article>)}
        </div> : <div className="rounded-xl border border-ink-200 bg-white p-8 text-center">
          <h3 className="font-bold text-ink-900">No products match these filters</h3>
          <p className="mt-2 text-sm text-ink-600">Try another grade or tell us what you need.</p>
          <button type="button" className="mt-3 font-semibold text-brand-700 underline" onClick={reset}>Clear filters</button>
        </div>}
        {!active && hidden.size > 0 && <div className="mt-5 flex flex-wrap gap-2" aria-label="More products by supplier">
          {[...hidden].map(([supplierId, count]) => {
            const supplier = products.find((p) => p.supplierId === supplierId)!;
            return <Link key={supplierId} href={`/suppliers/${encodeURIComponent(supplier.supplierSlug || supplierId)}#products`}
              className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800 hover:border-brand-500">
              +{count} more from {supplier.supplierName} →
            </Link>;
          })}
        </div>}
      </div>
    </div>
  </>;
}
