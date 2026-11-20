"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Check } from "lucide-react";

import type { ShowcaseMessages } from "@/lib/i18n/portal/showcase";
import {
  STOREFRONT_MAX_STATS, STOREFRONT_STATS, STOREFRONT_TAGLINE_MAX, STOREFRONT_TEMPLATES, STOREFRONT_TONE_COLORS, STOREFRONT_TONES,
  type StorefrontStat, type StorefrontTemplate, type StorefrontTheme, type StorefrontTone,
} from "@/lib/storefront-theme";
import { saveStorefrontThemeAction } from "./theme-actions";

/** Phác hoạ nhỏ của từng mẫu để nhà cung cấp nhận ra bố cục trước khi chọn. */
function Sketch({ template, accent, tint }: { template: StorefrontTemplate; accent: string; tint: string }) {
  if (template === "modern") return <div className="relative h-20 overflow-hidden rounded-md bg-[#3b3f45]">
    <div className="absolute bottom-3 left-3 h-2 w-16 rounded bg-white/90" />
    <div className="absolute bottom-7 left-3 h-1.5 w-8 rounded" style={{ background: accent }} />
    <div className="absolute -bottom-1 left-3 right-3 flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="h-3 flex-1 rounded-sm bg-white" style={{ borderTop: `2px solid ${accent}` }} />)}</div>
  </div>;
  if (template === "gallery") return <div className="flex h-20 gap-1 overflow-hidden rounded-md">
    <div className="w-1/3 p-1.5" style={{ background: tint }}><span className="block h-3 w-3 rounded-sm" style={{ background: accent }} /><span className="mt-1.5 block h-1.5 w-full rounded bg-ink-300" /><span className="mt-1 block h-1.5 w-2/3 rounded bg-ink-200" /></div>
    <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-1"><span className="row-span-2 rounded-sm bg-ink-300" /><span className="rounded-sm bg-ink-200" /><span className="rounded-sm bg-ink-200" /><span className="rounded-sm bg-ink-200" /><span className="rounded-sm bg-ink-200" /></div>
  </div>;
  return <div className="flex h-20 flex-col items-center gap-1 overflow-hidden rounded-md bg-[#FBF9F5] p-1.5">
    <span className="h-3 w-3 rounded-full bg-white ring-1 ring-ink-200" /><span className="h-1.5 w-14 rounded bg-ink-300" />
    <span className="h-0.5 w-5" style={{ background: accent }} /><span className="w-full flex-1 rounded-sm bg-ink-200" />
  </div>;
}

export function ThemeEditor({ initial, copy }: { initial: StorefrontTheme; copy: ShowcaseMessages["theme"] }) {
  const router = useRouter();
  const [template, setTemplate] = useState<StorefrontTemplate>(initial.template);
  const [tone, setTone] = useState<StorefrontTone>(initial.tone);
  const [tagline, setTagline] = useState(initial.tagline);
  const [stats, setStats] = useState<StorefrontStat[]>(initial.stats);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const taglineId = useId();
  const colors = STOREFRONT_TONE_COLORS[tone];

  const toggleStat = (stat: StorefrontStat) => setStats((current) => current.includes(stat)
    ? current.filter((item) => item !== stat)
    : current.length >= STOREFRONT_MAX_STATS ? current : [...current, stat]);

  const save = () => startTransition(async () => {
    setResult(null);
    const response = await saveStorefrontThemeAction({ template, tone, tagline, stats });
    setResult(response);
    if (response.ok) router.refresh();
  });

  return (
    <section aria-labelledby="theme-editor-title" className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <h2 id="theme-editor-title" className="text-[15px] font-bold text-ink-900">{copy.title}</h2>
      <p className="mt-0.5 text-xs leading-5 text-ink-500">{copy.sub}</p>

      <fieldset className="mt-4">
        <legend className="text-xs font-semibold text-ink-800">{copy.template}</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {STOREFRONT_TEMPLATES.map((value) => {
            const active = template === value;
            return <button key={value} type="button" aria-pressed={active} onClick={() => setTemplate(value)}
              className={`rounded-xl border p-2.5 text-left transition ${active ? "border-brand-700 ring-2 ring-brand-200" : "border-ink-200 hover:border-ink-300"}`}>
              <Sketch template={value} accent={colors.accent} tint={colors.tint} />
              <span className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ink-900">{active && <Check className="size-4 text-brand-700" aria-hidden="true" />}{copy.templates[value]}</span>
              <span className="mt-0.5 block text-[11.5px] leading-4 text-ink-500">{copy.templates[`${value}Hint`]}</span>
            </button>;
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-xs font-semibold text-ink-800">{copy.tone}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {STOREFRONT_TONES.map((value) => <button key={value} type="button" aria-pressed={tone === value} onClick={() => setTone(value)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${tone === value ? "border-brand-700 bg-brand-50 font-semibold text-ink-900" : "border-ink-200 text-ink-700 hover:bg-ink-50"}`}>
            <span className="size-4 rounded-full" style={{ background: STOREFRONT_TONE_COLORS[value].accent }} aria-hidden="true" />{copy.tones[value]}
          </button>)}
        </div>
      </fieldset>

      <div className="mt-5">
        <label htmlFor={taglineId} className="block text-xs font-semibold text-ink-800">{copy.tagline}</label>
        <input id={taglineId} value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={STOREFRONT_TAGLINE_MAX}
          placeholder={copy.taglinePlaceholder} className="input mt-1 w-full text-sm" />
        <p className="mt-1 text-right text-[11px] text-ink-500">{tagline.length}/{STOREFRONT_TAGLINE_MAX}</p>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold text-ink-800">{copy.stats}</legend>
        <p className="text-[11px] leading-4 text-ink-500">{copy.statsHint}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STOREFRONT_STATS.map((stat) => {
            const on = stats.includes(stat);
            return <button key={stat} type="button" aria-pressed={on} onClick={() => toggleStat(stat)} disabled={!on && stats.length >= STOREFRONT_MAX_STATS}
              className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 ${on ? "border-brand-700 bg-brand-50 font-semibold text-ink-900" : "border-ink-200 text-ink-700 hover:bg-ink-50"}`}>
              {copy.statLabels[stat]}
            </button>;
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-60">{pending ? copy.saving : copy.save}</button>
        {result && <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-800" : "text-rose-800"}`}>{result.message}</p>}
      </div>
    </section>
  );
}
