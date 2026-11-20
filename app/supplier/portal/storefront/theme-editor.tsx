"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { Check, Loader2, Pin, Trash2, Video } from "lucide-react";

import { fill } from "@/lib/i18n/format";
import type { ShowcaseMessages } from "@/lib/i18n/portal/showcase";
import { aplusVideoThumbnailUrl } from "@/lib/products/aplus";
import { checkVideoFile, uploadStreamVideoAt } from "@/lib/media/stream-upload-client";
import {
  STOREFRONT_MAX_FEATURED, STOREFRONT_MAX_STATS, STOREFRONT_STATS, STOREFRONT_TAGLINE_MAX, STOREFRONT_TONE_COLORS, STOREFRONT_TONES,
  type StorefrontStat, type StorefrontTheme, type StorefrontTone,
} from "@/lib/storefront-theme";
import { saveHeroVideoAction, saveStorefrontThemeAction } from "./theme-actions";

export type ThemeProductOption = { id: string; name: string; imageUrl: string | null };

/**
 * Giao diện trang gói Premium/Pro (đầu trang Hiện đại, chủ sàn chốt 2026-11-20): tông màu, câu
 * giới thiệu viết tiếng Việt (dịch khi lưu), video nhà máy (bấm mới phát), số liệu nổi bật từ hồ
 * sơ, tối đa 4 sản phẩm ghim.
 */
export function ThemeEditor({ initial, copy, products, videoErrors }: {
  initial: StorefrontTheme;
  copy: ShowcaseMessages["theme"];
  /** Sản phẩm đang hiện cho người mua (chỉ những sản phẩm này ghim được). */
  products: ThemeProductOption[];
  videoErrors: { video: string; videoTooLong: string; upload: string };
}) {
  const router = useRouter();
  const [tone, setTone] = useState<StorefrontTone>(initial.tone);
  // Câu cũ chỉ có bản tiếng Anh: hiện bản đó để sửa (lưu lại sẽ dịch theo câu mới).
  const [tagline, setTagline] = useState(initial.tagline_vi ?? initial.tagline);
  const [english, setEnglish] = useState(initial.tagline);
  const [stats, setStats] = useState<StorefrontStat[]>(initial.stats);
  const [featured, setFeatured] = useState<string[]>(initial.featured.filter((id) => products.some((p) => p.id === id)));
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [video, setVideo] = useState(initial.hero_video?.video_uid ?? null);
  const [progress, setProgress] = useState<number | null>(null);
  const [videoNote, setVideoNote] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const taglineId = useId();

  const toggleStat = (stat: StorefrontStat) => setStats((current) => current.includes(stat)
    ? current.filter((item) => item !== stat)
    : current.length >= STOREFRONT_MAX_STATS ? current : [...current, stat]);
  const togglePin = (id: string) => setFeatured((current) => current.includes(id)
    ? current.filter((item) => item !== id)
    : current.length >= STOREFRONT_MAX_FEATURED ? current : [...current, id]);

  const save = () => startTransition(async () => {
    setResult(null);
    const response = await saveStorefrontThemeAction({ tone, tagline, stats, featured });
    setResult(response);
    if (response.ok) { setEnglish(response.tagline ?? ""); router.refresh(); }
  });

  async function uploadVideo(file: File) {
    const problem = await checkVideoFile(file, videoErrors, fill);
    if (problem) { setVideoNote({ ok: false, message: problem }); return; }
    setProgress(0); setVideoNote(null);
    try {
      const uid = await uploadStreamVideoAt("/api/supplier-portal/company-aplus", file, setProgress, videoErrors.upload);
      const response = await saveHeroVideoAction(uid);
      setVideoNote(response);
      if (response.ok) { setVideo(uid); router.refresh(); }
    } catch (error) {
      setVideoNote({ ok: false, message: error instanceof Error ? error.message : videoErrors.upload });
    } finally { setProgress(null); }
  }

  return (
    <section aria-labelledby="theme-editor-title" className="mb-6 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <h2 id="theme-editor-title" className="text-[15px] font-bold text-ink-900">{copy.title}</h2>
      <p className="mt-0.5 text-xs leading-5 text-ink-500">{copy.sub}</p>

      <fieldset className="mt-4">
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
        <p className="mt-1 flex justify-between gap-2 text-[11px] text-ink-500"><span>{copy.taglineNote}</span><span>{tagline.length}/{STOREFRONT_TAGLINE_MAX}</span></p>
        {english && <p className="mt-1.5 rounded-lg bg-ink-50 px-3 py-2 text-[12.5px] text-ink-700"><span className="block text-[11px] font-semibold text-ink-500">{copy.taglineEnglish}</span>{english}</p>}
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold text-ink-800">{copy.video.title}</p>
        <p className="text-[11px] leading-4 text-ink-500">{copy.video.hint}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {video && <img src={aplusVideoThumbnailUrl(video, 160)} alt="" className="h-14 w-24 rounded-md bg-ink-900 object-cover ring-1 ring-ink-200" />}
          <button type="button" disabled={progress !== null} onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60">
            {progress !== null ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Video className="size-4" aria-hidden="true" />}
            {progress !== null ? fill(copy.video.uploading, { pct: progress }) : video ? copy.video.replace : copy.video.upload}
          </button>
          {video && progress === null && <button type="button" onClick={async () => {
            if (!window.confirm(copy.video.confirmRemove)) return;
            const response = await saveHeroVideoAction(null);
            setVideoNote(response);
            if (response.ok) { setVideo(null); router.refresh(); }
          }} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">
            <Trash2 className="size-4" aria-hidden="true" />{copy.video.remove}</button>}
          <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only"
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadVideo(file); }} />
        </div>
        {videoNote && <p role={videoNote.ok ? "status" : "alert"} className={`mt-1.5 text-xs ${videoNote.ok ? "text-emerald-800" : "text-rose-800"}`}>{videoNote.message}</p>}
      </div>

      <fieldset className="mt-5">
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

      <fieldset className="mt-5">
        <legend className="text-xs font-semibold text-ink-800">{copy.featured.title}</legend>
        <p className="text-[11px] leading-4 text-ink-500">{copy.featured.hint}</p>
        {products.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const order = featured.indexOf(product.id);
            const on = order >= 0;
            return <button key={product.id} type="button" aria-pressed={on} onClick={() => togglePin(product.id)} disabled={!on && featured.length >= STOREFRONT_MAX_FEATURED}
              className={`flex items-center gap-2.5 rounded-lg border p-2 text-left text-sm disabled:opacity-40 ${on ? "border-brand-700 bg-brand-50" : "border-ink-200 hover:bg-ink-50"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {product.imageUrl ? <img src={product.imageUrl} alt="" className="size-10 shrink-0 rounded-md object-cover" /> : <span className="size-10 shrink-0 rounded-md bg-ink-100" />}
              <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{product.name}</span>
              {on ? <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">{order + 1}</span>
                : <Pin className="size-4 shrink-0 text-ink-300" aria-hidden="true" />}
            </button>;
          })}
        </div> : <p className="mt-2 text-xs text-ink-500">{copy.featured.empty}</p>}
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-60">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}{pending ? copy.saving : copy.save}</button>
        {result && <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-800" : "text-rose-800"}`}>{result.message}</p>}
      </div>
    </section>
  );
}
