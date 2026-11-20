"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, ImagePlus, Loader2, Lock, Monitor, Smartphone, Sparkles, Trash2, X } from "lucide-react";

import { StorefrontBlocks } from "@/components/public/storefront-blocks";
import { fill } from "@/lib/i18n/format";
import type { DesignerMessages } from "@/lib/i18n/portal/designer";
import { prepareImage } from "@/lib/media/client-image";
import {
  ABOUT_BODY_MAX, ABOUT_TITLE_MAX, BANNER_EYEBROW_MAX, BANNER_HEADLINE_MAX, BANNER_MAX_IMAGES, FEATURED_MAX_PRODUCTS,
  LAYOUT_BLOCK_TYPES, LAYOUT_MAX_ABOUT, LAYOUT_MAX_BLOCKS, newLayoutBlockId, PRO_ONLY_BLOCKS, REQUIRED_BLOCKS, VIDEO_TITLE_MAX,
  type LayoutBlock, type LayoutBlockType, type StorefrontLayout,
} from "@/lib/storefront-layout";
import {
  STOREFRONT_MAX_STATS, STOREFRONT_STATS, STOREFRONT_TAGLINE_MAX, STOREFRONT_TONE_COLORS, STOREFRONT_TONES,
  type StorefrontStat,
} from "@/lib/storefront-theme";
import { STOREFRONT_STAT_LABELS, type StorefrontBlockCategory, type StorefrontBlockCertificate, type StorefrontBlocksData } from "@/components/public/storefront-blocks";
import { checkVideoFile, uploadStreamVideoTo } from "@/lib/media/stream-upload-client";
import { PROFILE_FIELDS_BY_BLOCK, STOREFRONT_PROFILE_FIELDS, type StorefrontProfileField, type StorefrontProfilePatch } from "@/lib/storefront-profile-fields";
import { aplusVideoEmbedUrl } from "@/lib/products/aplus";
import { PremiumHeader } from "@/components/public/premium-header";

export type DesignerProduct = { id: string; name: string; imageUrl: string | null; detail?: string };
export type DesignerResult = { ok: boolean; message: string };
/** Giá trị hồ sơ hiện tại (bản gốc nhà cung cấp nhập) cho các ô sửa trong bảng chỉnh. */
export type ProfileValues = Partial<Record<StorefrontProfileField, string>> & { legal_name: string; address: string; moq: string };

const HEADER = "__header__";

/**
 * Trình "Thiết kế trang" (bản mẫu duyệt 2026-11-20, docs/storefront-designer). Cột trái: Tạo
 * nhanh, danh sách khối, thư viện khối. Giữa: xem trước trực tiếp (máy tính / điện thoại).
 * Phải: chỉnh khối đang chọn. Dùng chung cho cổng nhà cung cấp và CRM thiết kế hộ: nơi gọi
 * truyền hàm lưu nháp, áp dụng và đường tải ảnh của mình.
 */
export function StorefrontDesigner(props: {
  initial: StorefrontLayout;
  /** Bố cục dựng từ hồ sơ cho nút Tạo nhanh; null khi hồ sơ chưa đủ nội dung. */
  quick: StorefrontLayout | null;
  /** Bản nháp hiện trùng bản đang công khai. */
  live: boolean;
  header: { name: string; location: string; checks: string[]; avatarUrl: string | null; coverUrl?: string | null };
  statValues: Partial<Record<StorefrontStat, string>>;
  markets: string[];
  products: DesignerProduct[];
  /** Tiền tố xem trước ảnh, nối thêm đường dẫn đã mã hoá. */
  imagePreviewBase: string;
  uploadUrl: string;
  uploadFields?: Record<string, string>;
  saveDraft: (layout: StorefrontLayout) => Promise<DesignerResult>;
  apply: (layout: StorefrontLayout) => Promise<DesignerResult>;
  copy: DesignerMessages;
  applyLabel?: string;
  previewHref?: string | null;
  /** Khối chèn trên cùng cột trái (ví dụ ghi chú CRM). */
  aside?: ReactNode;
  /** Gói Pro: mở khối Video nhà máy và Nhóm sản phẩm. */
  pro: boolean;
  categories: StorefrontBlockCategory[];
  certificates: StorefrontBlockCertificate[];
  /** Nội dung các mục chung dựng sẵn ở máy chủ (cùng component với trang thật). */
  sections: StorefrontBlocksData["sections"];
  /**
   * Chỉ cổng nhà cung cấp: sửa thông tin hồ sơ ngay trong bảng chỉnh của các khối lấy từ hồ sơ.
   * Không truyền (CRM) thì các khối này chỉ có hướng dẫn.
   */
  profile?: { values: ProfileValues; save: (patch: StorefrontProfilePatch) => Promise<DesignerResult> };
}) {
  const { copy } = props;
  const router = useRouter();
  const [layout, setLayout] = useState<StorefrontLayout>(props.initial);
  const [baseline, setBaseline] = useState(JSON.stringify(props.initial));
  const [live, setLive] = useState(props.live);
  const [selected, setSelected] = useState<string>(props.initial.blocks[0]?.id ?? HEADER);
  // Chọn từ danh sách bên trái (hoặc vừa thêm khối): cuộn khung xem trước tới đúng khối đó.
  const [scrollTarget, setScrollTarget] = useState<{ id: string } | null>(null);
  const focusBlock = (id: string) => { setSelected(id); setScrollTarget({ id }); };
  useEffect(() => {
    if (!scrollTarget) return;
    const target = scrollTarget.id === HEADER ? document.querySelector("[data-block-id='__header__']")
      : document.querySelector(`[data-block-id="${CSS.escape(scrollTarget.id)}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollTarget]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState<"save" | "apply" | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(layout) !== baseline;
  const previewUrl = (path: string) => `${props.imagePreviewBase}${encodeURIComponent(path)}`;
  const productMap = useMemo(() => Object.fromEntries(props.products.map((p) => [p.id, { name: p.name, imageUrl: p.imageUrl, href: null, detail: p.detail }])), [props.products]);
  const block = layout.blocks.find((b) => b.id === selected) ?? null;

  const setBlocks = (fn: (blocks: LayoutBlock[]) => LayoutBlock[]) => setLayout((l) => ({ ...l, blocks: fn(l.blocks) }));
  const patch = (id: string, change: Partial<LayoutBlock>) => setBlocks((all) => all.map((b) => b.id === id ? { ...b, ...change } as LayoutBlock : b));
  const move = (index: number, step: -1 | 1) => setBlocks((all) => {
    const next = [...all]; const target = index + step;
    if (target < 0 || target >= next.length) return all;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const used = new Set(layout.blocks.map((b) => b.type));
  const aboutCount = layout.blocks.filter((b) => b.type === "about").length;
  const proLocked = (type: LayoutBlockType) => !props.pro && PRO_ONLY_BLOCKS.includes(type);
  const canAdd = (type: LayoutBlockType) => !proLocked(type) && layout.blocks.length < LAYOUT_MAX_BLOCKS && (type === "about" ? aboutCount < LAYOUT_MAX_ABOUT : !used.has(type));

  function add(type: LayoutBlockType) {
    const id = newLayoutBlockId();
    const firstProducts = props.products.slice(0, 4).map((p) => p.id);
    const statDefaults = STOREFRONT_STATS.filter((stat) => props.statValues[stat]).slice(0, STOREFRONT_MAX_STATS);
    const next: LayoutBlock = type === "banner" ? { id, type, images: [], eyebrow: "", headline: "" }
      : type === "stats" ? { id, type, stats: statDefaults.length ? statDefaults : ["capacity"] }
        : type === "products" ? { id, type, product_ids: firstProducts }
          : type === "about" ? { id, type, image_path: "", title: "", body: "" }
            : type === "video" ? { id, type, video_uid: "", title: "" } : { id, type };
    setBlocks((all) => [...all, next]);
    focusBlock(id);
  }

  async function upload(key: string, file: File): Promise<string | null> {
    setUploading(key); setMessage(null);
    try {
      const prepared = await prepareImage(file);
      const body = new FormData();
      for (const [name, value] of Object.entries(props.uploadFields ?? {})) body.append(name, value);
      body.append("file", new File([prepared.main], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      const res = await fetch(props.uploadUrl, { method: "POST", body });
      const data = await res.json().catch(() => null) as { ok?: boolean; path?: string; message?: string } | null;
      if (!res.ok || !data?.ok || !data.path) throw new Error(data?.message || copy.errors.upload);
      return data.path;
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload });
      return null;
    } finally { setUploading(null); }
  }

  async function run(kind: "save" | "apply") {
    if (kind === "apply" && !window.confirm(copy.confirmApply)) return;
    setBusy(kind); setMessage(null);
    try {
      const result = await (kind === "save" ? props.saveDraft(layout) : props.apply(layout));
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) { setBaseline(JSON.stringify(layout)); setLive(kind === "apply"); router.refresh(); }
    } catch { setMessage({ ok: false, text: copy.failed }); }
    finally { setBusy(null); }
  }

  function quickBuild() {
    if (!props.quick || !props.quick.blocks.length) { setMessage({ ok: false, text: copy.quick.empty }); return; }
    if (layout.blocks.length && !window.confirm(copy.quick.confirm)) return;
    setLayout(props.quick);
    setSelected(props.quick.blocks[0]?.id ?? HEADER);
    setMessage({ ok: true, text: fill(copy.quick.done, { count: props.quick.blocks.length }) });
  }

  const status = dirty ? copy.status.dirty : live ? copy.status.live : copy.status.draft;
  const tone = STOREFRONT_TONE_COLORS[layout.tone];

  return <div className="overflow-clip rounded-xl border border-ink-200 bg-white">
    {/* Thanh trạng thái và nút lưu */}
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-3">
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dirty || !live ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{status}</span>
      {message && <span role={message.ok ? "status" : "alert"} className={`text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {props.previewHref && <a href={props.previewHref} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">{copy.preview}<ExternalLink className="size-3.5" aria-hidden="true" /></a>}
        <button type="button" className="btn btn-soft btn-sm" disabled={!!busy || !!uploading || !dirty} onClick={() => void run("save")}>{busy === "save" ? copy.saving : copy.save}</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !!uploading || (live && !dirty)} onClick={() => void run("apply")}>{busy === "apply" ? copy.applying : props.applyLabel ?? copy.apply}</button>
      </div>
    </div>

    <div className="grid lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_300px]">
      {/* Cột trái */}
      {/* Hai cột bên đứng yên khi cuộn khung xem trước, để danh sách khối và bảng chỉnh luôn trong tầm tay. */}
      <aside className="border-b border-ink-200 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-r">
        {props.aside}
        <div className="m-3 rounded-xl border border-dashed border-brand-200 bg-brand-50/70 p-3">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-brand-800"><Sparkles className="size-4" aria-hidden="true" />{copy.quick.title}</p>
          <p className="mt-1 text-xs leading-5 text-ink-600">{copy.quick.body}</p>
          <button type="button" onClick={quickBuild} className="btn btn-primary btn-sm mt-2 w-full justify-center">{copy.quick.button}</button>
        </div>
        <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-500">{copy.listTitle}</p>
        <ul className="space-y-0.5 px-2">
          <li>
            <button type="button" onClick={() => focusBlock(HEADER)}
              className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-[12.5px] font-semibold ${selected === HEADER ? "border-brand-600 bg-brand-50" : "border-transparent bg-ink-50 hover:bg-ink-100"}`}>
              <Lock className="size-3.5 shrink-0 text-ink-500" aria-hidden="true" /><span className="min-w-0 flex-1">{copy.header}</span>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-ink-500">{copy.headerLocked}</span>
            </button>
          </li>
          {layout.blocks.map((b, index) => <li key={b.id}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${selected === b.id ? "border-brand-600 bg-brand-50" : "border-transparent hover:bg-ink-50"}`}>
            <button type="button" onClick={() => focusBlock(b.id)} className={`min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold ${b.hidden ? "text-ink-400 line-through" : "text-ink-900"}`}>{copy.types[b.type].name}</button>
            <Tool label={copy.moveUp} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Tool>
            <Tool label={copy.moveDown} disabled={index === layout.blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Tool>
            {REQUIRED_BLOCKS.includes(b.type)
              ? <span title={copy.requiredHint} className="rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold text-ink-600">{copy.required}</span>
              : <>
                <Tool label={b.hidden ? copy.show : copy.hide} onClick={() => patch(b.id, { hidden: !b.hidden || undefined })}>{b.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</Tool>
                <Tool label={copy.remove} onClick={() => { if (window.confirm(copy.confirmRemove)) { setBlocks((all) => all.filter((x) => x.id !== b.id)); if (selected === b.id) setSelected(HEADER); } }}><Trash2 className="size-3.5" /></Tool>
              </>}
          </li>)}
        </ul>
        <p className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-ink-500">{copy.addTitle}</p>
        <div className="grid grid-cols-2 gap-2 px-3 pb-4">
          {LAYOUT_BLOCK_TYPES.map((type) => <button key={type} type="button" disabled={!canAdd(type)} onClick={() => add(type)}
            className="rounded-lg border border-ink-200 bg-white p-2 text-left text-xs font-semibold text-ink-900 transition hover:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50">
            <span className="flex items-center justify-between gap-1">{copy.types[type].name}
              {PRO_ONLY_BLOCKS.includes(type) && <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-800">{copy.proOnly}</span>}</span>
            <span className="mt-0.5 block text-[11px] font-normal text-ink-500">{proLocked(type) ? copy.proHint : canAdd(type) ? copy.types[type].desc : copy.already}</span>
          </button>)}
        </div>
      </aside>

      {/* Xem trước */}
      <main className="min-w-0 bg-ink-50 p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-xs text-ink-500">{copy.previewLabel}</span>
          <div role="group" aria-label={copy.device.label} className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
            {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${device === d ? "bg-brand-700 text-white" : "text-ink-600"}`}>
              {d === "desktop" ? <Monitor className="size-3.5" aria-hidden="true" /> : <Smartphone className="size-3.5" aria-hidden="true" />}{copy.device[d]}
            </button>)}
          </div>
        </div>
        <div className={`mx-auto overflow-hidden rounded-xl bg-white p-3 shadow-sm ring-1 ring-ink-200 transition-[max-width] sm:p-5 ${device === "mobile" ? "max-w-[390px]" : "max-w-[980px]"}`}
          style={{ "--sf-accent": tone.accent, "--sf-dark": tone.dark, "--sf-tint": tone.tint } as CSSProperties}>
          <button type="button" data-block-id="__header__" onClick={() => setSelected(HEADER)}
            className={`relative block w-full scroll-mt-28 rounded-xl text-left outline outline-2 outline-offset-4 ${selected === HEADER ? "outline-brand-600" : "outline-transparent hover:outline-brand-200"}`}>
            <HeaderPreview layout={layout} header={props.header} previewUrl={previewUrl} />
            <span className="absolute right-3 top-3 z-10 rounded-md bg-white/90 px-1.5 py-0.5 text-[10.5px] text-ink-600">{copy.headerLockHint}</span>
          </button>
          <StorefrontBlocks layout={layout} selectedId={selected} onSelect={setSelected} showHidden
            emptyBlock={(b) => <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-4 py-5 text-sm">
              <p className="font-semibold text-ink-800">{copy.types[b.type].name}</p>
              <p className="mt-0.5 text-xs leading-5 text-ink-500">{copy.emptyBlock}</p>
            </div>}
            data={{ statValues: props.statValues, markets: props.markets, products: productMap, imageUrl: previewUrl,
              categories: props.categories, certificates: props.certificates, sections: props.sections }} />
          {!layout.blocks.length && <p className="mt-6 rounded-lg border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">{copy.quick.body}</p>}
        </div>
      </main>

      {/* Chỉnh khối */}
      <aside className="border-t border-ink-200 lg:col-span-2 xl:sticky xl:top-20 xl:col-span-1 xl:max-h-[calc(100vh-6rem)] xl:self-start xl:overflow-y-auto xl:border-l xl:border-t-0">
        <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-ink-500">{copy.editTitle}</p>
        <div className="space-y-3 px-4 pb-5 text-[12.5px]">
          {selected === HEADER ? <HeaderSettings layout={layout} setLayout={setLayout} copy={copy} />
            : block ? <BlockSettings block={block} patch={patch} copy={copy} statValues={props.statValues} markets={props.markets}
              products={props.products} previewUrl={previewUrl} upload={upload} uploading={uploading}
              categories={props.categories} certificates={props.certificates} hasGallery={!!props.sections?.gallery} profile={props.profile}
              uploadVideo={async (file, onProgress) => {
                const problem = await checkVideoFile(file, { video: copy.errors.videoFile, videoTooLong: copy.errors.videoTooLong, upload: copy.errors.upload }, fill);
                if (problem) throw new Error(problem);
                return uploadStreamVideoTo(props.uploadUrl, props.uploadFields ?? {}, file, onProgress, copy.errors.upload);
              }} />
              : <p className="text-ink-500">{copy.pick}</p>}
        </div>
      </aside>
    </div>
  </div>;
}

function Tool({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className="rounded-md p-1 text-ink-500 hover:bg-white hover:text-ink-900 disabled:opacity-30">{children}</button>;
}

/** Đầu trang dùng đúng component của trang thật, nên xem trước khớp với trang công khai. */
function HeaderPreview({ layout, header, previewUrl }: { layout: StorefrontLayout; header: { name: string; location: string; checks: string[]; avatarUrl: string | null; coverUrl?: string | null }; previewUrl: (path: string) => string }) {
  // Giống trang thật: ảnh bìa làm nền, chưa có thì ảnh banner đầu tiên.
  const banner = layout.blocks.find((block) => block.type === "banner" && !block.hidden);
  const cover = header.coverUrl ?? (banner?.type === "banner" && banner.images[0] ? previewUrl(banner.images[0]) : null);
  return <PremiumHeader name={header.name} nameTag="h2" location={header.location} tagline={layout.tagline} coverUrl={cover} avatarUrl={header.avatarUrl}
    checks={<div className="flex flex-wrap gap-2">{header.checks.map((check) => <span key={check} className="rounded-full bg-success-surface px-3 py-1 text-xs font-semibold text-success">{check}</span>)}</div>}
    actions={<span className="inline-flex items-center justify-center rounded-lg bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-bold text-white">Request a quote</span>} />;
}

function Counter({ value, max, copy }: { value: string; max: number; copy: DesignerMessages }) {
  return <span className={`mt-1 block text-[11px] ${value.length > max ? "text-rose-700" : "text-ink-400"}`}>{fill(copy.fields.chars, { count: value.length, max })}</span>;
}

function HeaderSettings({ layout, setLayout, copy }: { layout: StorefrontLayout; setLayout: (fn: (l: StorefrontLayout) => StorefrontLayout) => void; copy: DesignerMessages }) {
  return <>
    <p className="font-bold text-ink-900">{copy.header}</p>
    <p className="leading-5 text-ink-600">{copy.fields.headerHelp}</p>
    <fieldset>
      <legend className="mb-1 font-semibold text-ink-700">{copy.fields.tone}</legend>
      <div className="grid grid-cols-2 gap-1.5">
        {STOREFRONT_TONES.map((t) => <button key={t} type="button" aria-pressed={layout.tone === t} onClick={() => setLayout((l) => ({ ...l, tone: t }))}
          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold ${layout.tone === t ? "border-brand-600 bg-brand-50" : "border-ink-200"}`}>
          <span className="size-3.5 rounded-full" style={{ background: STOREFRONT_TONE_COLORS[t].accent }} />{copy.fields.tones[t]}</button>)}
      </div>
    </fieldset>
    <label className="block font-semibold text-ink-700">{copy.fields.tagline}
      <textarea rows={3} value={layout.tagline} maxLength={STOREFRONT_TAGLINE_MAX + 20} onChange={(e) => setLayout((l) => ({ ...l, tagline: e.target.value }))} className="input mt-1 w-full font-normal" />
      <Counter value={layout.tagline} max={STOREFRONT_TAGLINE_MAX} copy={copy} />
    </label>
  </>;
}

function BlockSettings(props: Parameters<typeof BlockSettingsInner>[0] & { profile?: { values: ProfileValues; save: (patch: StorefrontProfilePatch) => Promise<DesignerResult> } }) {
  const fields = props.profile ? PROFILE_FIELDS_BY_BLOCK[props.block.type] : undefined;
  return <>
    <BlockSettingsInner {...props} />
    {props.profile && fields && <ProfileFields key={props.block.type} fields={fields} block={props.block.type} profile={props.profile} copy={props.copy} />}
  </>;
}

/** Ô sửa thông tin hồ sơ cho khối lấy từ hồ sơ; lưu ngay vào Hồ sơ công ty. */
function ProfileFields({ fields, block, profile, copy }: {
  fields: StorefrontProfileField[];
  block: LayoutBlockType;
  profile: { values: ProfileValues; save: (patch: StorefrontProfilePatch) => Promise<DesignerResult> };
  copy: DesignerMessages;
}) {
  const router = useRouter();
  const t = copy.profile;
  const initial = Object.fromEntries(fields.map((f) => [f, profile.values[f] ?? ""])) as Record<StorefrontProfileField, string>;
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = fields.filter((f) => values[f] !== saved[f]);
  const field = "input mt-1 w-full font-normal";
  return <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
    <p className="font-bold text-ink-900">{t.title}</p>
    <p className="rounded-md bg-amber-50 p-2 text-[11.5px] leading-5 text-amber-900">{t.note}</p>
    {fields.map((f) => {
      const spec = STOREFRONT_PROFILE_FIELDS[f];
      const label = t.fields[f];
      const long = f === "intro_source" || f === "products" || f === "markets";
      return <label key={f} className="block font-semibold text-ink-700">{label}
        {long
          ? <textarea rows={f === "intro_source" ? 6 : 3} value={values[f]} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} className={field} />
          : <input value={values[f]} inputMode={spec.kind === "int" ? "numeric" : undefined} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} className={field} />}
        {spec.kind === "list" && <span className="mt-0.5 block text-[11px] font-normal text-ink-500">{t.listHint}</span>}
        {spec.kind === "text" && <Counter value={values[f]} max={spec.max} copy={copy} />}
      </label>;
    })}
    {block === "details" && <ReadOnly label={t.fields.legal_name} value={profile.values.legal_name} hint={t.readOnly} />}
    {block === "details" && <ReadOnly label={t.fields.address} value={profile.values.address} hint={t.readOnly} />}
    {block === "trade" && <ReadOnly label={t.fields.moq} value={profile.values.moq} hint={t.readOnly} />}
    <button type="button" disabled={busy || changed.length === 0} className="btn btn-primary btn-sm" onClick={async () => {
      setBusy(true); setNote(null);
      const result = await profile.save(Object.fromEntries(changed.map((f) => [f, values[f]]))).catch(() => ({ ok: false, message: copy.failed }));
      setNote({ ok: result.ok, text: result.message }); setBusy(false);
      if (result.ok) { setSaved(values); router.refresh(); }
    }}>{busy ? t.saving : t.save}</button>
    {note && <p role={note.ok ? "status" : "alert"} className={`text-[11.5px] font-semibold ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</p>}
  </div>;
}

function ReadOnly({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div>
    <p className="font-semibold text-ink-700">{label}</p>
    <p className="mt-1 rounded-md bg-ink-50 px-2.5 py-1.5 text-ink-800">{value || "—"}</p>
    <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>
  </div>;
}

function BlockSettingsInner({ block, patch, copy, statValues, markets, products, previewUrl, upload, uploading, categories, certificates, uploadVideo, hasGallery }: {
  block: LayoutBlock;
  patch: (id: string, change: Partial<LayoutBlock>) => void;
  copy: DesignerMessages;
  statValues: Partial<Record<StorefrontStat, string>>;
  markets: string[];
  products: DesignerProduct[];
  previewUrl: (path: string) => string;
  upload: (key: string, file: File) => Promise<string | null>;
  uploading: string | null;
  categories: StorefrontBlockCategory[];
  certificates: StorefrontBlockCertificate[];
  uploadVideo: (file: File, onProgress: (pct: number) => void) => Promise<string>;
  hasGallery: boolean;
}) {
  const title = <p className="font-bold text-ink-900">{copy.types[block.type].name}</p>;
  const field = "input mt-1 w-full font-normal";
  switch (block.type) {
    case "banner": return <>
      {title}
      <div>
        <p className="mb-1 font-semibold text-ink-700">{copy.fields.images}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {block.images.map((path) => <div key={path} className="relative aspect-[16/10] overflow-hidden rounded-md border border-ink-200 bg-ink-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl(path)} alt="" className="h-full w-full object-cover" />
            <button type="button" aria-label={copy.fields.removeImage} onClick={() => patch(block.id, { images: block.images.filter((x) => x !== path) })}
              className="absolute right-1 top-1 rounded-full bg-white/95 p-0.5 text-rose-700 shadow"><X className="size-3" /></button>
          </div>)}
          {block.images.length < BANNER_MAX_IMAGES && <ImageInput label={copy.fields.addImage} busy={uploading === block.id}
            onFile={async (file) => { const path = await upload(block.id, file); if (path) patch(block.id, { images: [...block.images, path] }); }} />}
        </div>
        <p className="mt-1 text-[11px] leading-4 text-ink-500">{copy.fields.imageHint}</p>
      </div>
      <label className="block font-semibold text-ink-700">{copy.fields.eyebrow}
        <input value={block.eyebrow} onChange={(e) => patch(block.id, { eyebrow: e.target.value })} className={field} />
        <Counter value={block.eyebrow} max={BANNER_EYEBROW_MAX} copy={copy} />
      </label>
      <label className="block font-semibold text-ink-700">{copy.fields.headline}
        <textarea rows={3} value={block.headline} onChange={(e) => patch(block.id, { headline: e.target.value })} className={field} />
        <Counter value={block.headline} max={BANNER_HEADLINE_MAX} copy={copy} />
      </label>
    </>;
    case "stats": return <>
      {title}
      <p className="leading-5 text-ink-600">{copy.fields.statsHelp}</p>
      <div className="space-y-1.5">
        {STOREFRONT_STATS.map((stat) => {
          const checked = block.stats.includes(stat);
          const value = statValues[stat];
          return <label key={stat} className={`flex items-start gap-2 ${value ? "" : "opacity-60"}`}>
            <input type="checkbox" checked={checked} disabled={!checked && (block.stats.length >= STOREFRONT_MAX_STATS || !value)}
              onChange={() => patch(block.id, { stats: checked ? block.stats.filter((x) => x !== stat) : [...block.stats, stat] })} className="mt-0.5 size-4 accent-brand-700" />
            <span><span className="font-semibold text-ink-800">{STOREFRONT_STAT_LABELS[stat]}</span> · <span className="text-ink-600">{value || copy.fields.statsEmpty}</span></span>
          </label>;
        })}
      </div>
      <p className="rounded-md bg-ink-50 p-2 text-[11.5px] leading-5 text-ink-600">{copy.fields.profileHint}</p>
    </>;
    case "products": return <>
      {title}
      <p className="leading-5 text-ink-600">{copy.fields.productsHelp}</p>
      {products.length === 0 ? <p className="text-ink-500">{copy.fields.productsNone}</p>
        : <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
          {products.map((product) => {
            const checked = block.product_ids.includes(product.id);
            return <li key={product.id}><label className="flex items-center gap-2 px-2 py-1.5">
              <input type="checkbox" checked={checked} disabled={!checked && block.product_ids.length >= FEATURED_MAX_PRODUCTS}
                onChange={() => patch(block.id, { product_ids: checked ? block.product_ids.filter((x) => x !== product.id) : [...block.product_ids, product.id] })} className="size-4 accent-brand-700" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {product.imageUrl ? <img src={product.imageUrl} alt="" className="size-8 rounded object-cover" /> : <span className="size-8 rounded bg-ink-100" />}
              <span className="min-w-0 flex-1 truncate">{product.name}</span>
            </label></li>;
          })}
        </ul>}
    </>;
    case "about": return <>
      {title}
      <div>
        <p className="mb-1 font-semibold text-ink-700">{copy.fields.image}</p>
        {block.image_path
          ? <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-ink-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl(block.image_path)} alt="" className="h-full w-full object-cover" />
          </div> : null}
        <div className="mt-1.5 w-1/2"><ImageInput label={block.image_path ? copy.fields.replaceImage : copy.fields.addImage} busy={uploading === block.id}
          onFile={async (file) => { const path = await upload(block.id, file); if (path) patch(block.id, { image_path: path }); }} /></div>
        <p className="mt-1 text-[11px] leading-4 text-ink-500">{copy.fields.aboutImageHint}</p>
      </div>
      <label className="block font-semibold text-ink-700">{copy.fields.title}
        <input value={block.title} onChange={(e) => patch(block.id, { title: e.target.value })} className={field} />
        <Counter value={block.title} max={ABOUT_TITLE_MAX} copy={copy} />
      </label>
      <label className="block font-semibold text-ink-700">{copy.fields.body}
        <textarea rows={6} value={block.body} onChange={(e) => patch(block.id, { body: e.target.value })} className={field} />
        <Counter value={block.body} max={ABOUT_BODY_MAX} copy={copy} />
      </label>
    </>;
    case "markets": return <>
      {title}
      <p className="leading-5 text-ink-600">{markets.length ? copy.fields.marketsHelp : copy.fields.marketsEmpty}</p>
      {markets.length > 0 && <p className="text-ink-800">{markets.join(", ")}</p>}
    </>;
    case "video": return <>
      {title}
      <VideoSettings block={block} patch={patch} copy={copy} uploadVideo={uploadVideo} />
    </>;
    case "categories": return <>
      {title}
      <p className="leading-5 text-ink-600">{categories.length >= 2 ? copy.fields.categoriesHelp : copy.fields.categoriesEmpty}</p>
      {categories.length >= 2 && <ul className="space-y-1 text-ink-800">{categories.map((c) => <li key={c.name}>{c.name} · {c.count}</li>)}</ul>}
    </>;
    case "company": return <>{title}<p className="leading-5 text-ink-600">{copy.fields.companyHelp}</p></>;
    case "checks": return <>{title}<p className="rounded-md bg-ink-50 p-2 leading-5 text-ink-600">{copy.requiredHint}</p></>;
    case "trade": return <>{title}<p className="leading-5 text-ink-600">{copy.fields.tradeHelp}</p></>;
    case "details": return <>{title}<p className="leading-5 text-ink-600">{copy.fields.detailsHelp}</p></>;
    case "gallery": return <>{title}<p className="leading-5 text-ink-600">{hasGallery ? copy.fields.galleryHelp : copy.fields.galleryEmpty}</p></>;
    case "certificates": return <>
      {title}
      <p className="leading-5 text-ink-600">{certificates.length ? copy.fields.certificatesHelp : copy.fields.certificatesEmpty}</p>
      {certificates.length > 0 && <ul className="space-y-1 text-ink-800">{certificates.map((c) => <li key={`${c.name}-${c.detail}`}>{c.name}{c.detail ? ` · ${c.detail}` : ""}</li>)}</ul>}
    </>;
  }
}

function VideoSettings({ block, patch, copy, uploadVideo }: {
  block: Extract<LayoutBlock, { type: "video" }>;
  patch: (id: string, change: Partial<LayoutBlock>) => void;
  copy: DesignerMessages;
  uploadVideo: (file: File, onProgress: (pct: number) => void) => Promise<string>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return <>
    <div>
      <p className="mb-1 font-semibold text-ink-700">{copy.fields.video}</p>
      {block.video_uid && <div className="aspect-video overflow-hidden rounded-md border border-ink-200 bg-black">
        <iframe src={aplusVideoEmbedUrl(block.video_uid)} title={block.title || copy.fields.video} allow="accelerometer; gyroscope; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full border-0" />
      </div>}
      <button type="button" disabled={progress !== null} onClick={() => input.current?.click()} className="btn btn-soft btn-sm mt-1.5">
        {progress !== null ? <><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{fill(copy.fields.uploadingPct, { pct: progress })}</> : block.video_uid ? copy.fields.replaceVideo : copy.fields.chooseVideo}
      </button>
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (!file) return;
          setNote(null); setProgress(0);
          try {
            const uid = await uploadVideo(file, setProgress);
            patch(block.id, { video_uid: uid, duration: undefined, uploaded_at: undefined });
            setNote({ ok: true, text: copy.fields.videoProcessing });
          } catch (error) { setNote({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload }); }
          finally { setProgress(null); }
        }} />
      <p className="mt-1 text-[11px] leading-4 text-ink-500">{copy.fields.videoHint}</p>
      {note && <p role={note.ok ? "status" : "alert"} className={`mt-1 text-[11.5px] font-semibold ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</p>}
    </div>
    <label className="block font-semibold text-ink-700">{copy.fields.videoTitle}
      <input value={block.title} onChange={(e) => patch(block.id, { title: e.target.value })} className="input mt-1 w-full font-normal" />
      <Counter value={block.title} max={VIDEO_TITLE_MAX} copy={copy} />
    </label>
  </>;
}

function ImageInput({ label, busy, onFile }: { label: string; busy: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <button type="button" disabled={busy} onClick={() => input.current?.click()}
    className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink-300 bg-white text-[11px] font-semibold text-ink-500 hover:border-brand-500 hover:text-brand-700 disabled:opacity-60">
    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-4" aria-hidden="true" />}{label}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1}
      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onFile(file); }} />
  </button>;
}
