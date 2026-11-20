"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ExternalLink, ImagePlus, Loader2, Monitor, Pencil, Redo2, Settings2, Smartphone, Sparkles, Undo2, X } from "lucide-react";

import type { BlockEditor } from "@/components/public/storefront-blocks";
import type { PageEditorHandle, SectionPatch } from "@/components/storefront-designer/page-editor";

/** Trình soạn chỉ chạy ở trình duyệt (BlockNote cần DOM). */
const PageEditor = dynamic(() => import("@/components/storefront-designer/page-editor").then((m) => m.PageEditor), {
  ssr: false,
  loading: () => <div className="flex h-60 items-center justify-center text-ink-400"><Loader2 className="size-5 animate-spin" aria-hidden="true" /></div>,
});
import { AddImageTile, ImageOverlay, InlineText, VideoPicker, type InlineCopy } from "@/components/storefront-designer/inline-edit";
import { fill } from "@/lib/i18n/format";
import type { DesignerMessages } from "@/lib/i18n/portal/designer";
import { prepareImage } from "@/lib/media/client-image";
import {
  ABOUT_BODY_MAX, ABOUT_TITLE_MAX, BANNER_EYEBROW_MAX, BANNER_HEADLINE_MAX, BANNER_MAX_IMAGES, FEATURED_MAX_PRODUCTS,
  COMPANY_MAX_IMAGES, GALLERY_MAX_IMAGES, LAYOUT_BLOCK_TYPES, LAYOUT_MAX_ABOUT, LAYOUT_MAX_BLOCKS, newLayoutBlockId, PRO_ONLY_BLOCKS, REQUIRED_BLOCKS, VIDEO_TITLE_MAX,
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
import { SupplierCoverDeleteButton, SupplierPhotoButton } from "@/components/supplier-photo-button";

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
  /** Khối chèn trên cùng (ví dụ ghi chú CRM). */
  aside?: ReactNode;
  /** Gói Pro: mở khối Video nhà máy và Nhóm sản phẩm. */
  pro: boolean;
  categories: StorefrontBlockCategory[];
  certificates: StorefrontBlockCertificate[];
  /** Nội dung các mục chung dựng sẵn ở máy chủ (cùng component với trang thật). */
  sections: StorefrontBlocksData["sections"];
  /**
   * Chỉ cổng nhà cung cấp: sửa thông tin hồ sơ ngay trong cài đặt của các mục lấy từ hồ sơ.
   * Không truyền (CRM) thì các mục này chỉ có hướng dẫn.
   */
  profile?: { values: ProfileValues; save: (patch: StorefrontProfilePatch) => Promise<DesignerResult> };
}) {
  const { copy } = props;
  const router = useRouter();
  const pageEditor = useRef<PageEditorHandle>(null);
  const [layout, setLayout] = useState<StorefrontLayout>(props.initial);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [baseline, setBaseline] = useState(() => JSON.stringify(props.initial));
  // Lần đầu trình soạn đọc lại tài liệu, bố cục có thể khác chút về hình thức (gộp đoạn văn):
  // coi đó là điểm xuất phát, không phải thay đổi chưa lưu.
  const settled = useRef(false);
  const [live, setLive] = useState(props.live);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [busy, setBusy] = useState<"save" | "apply" | null>(null);
  const [uploading, setUploading] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [headerOpen, setHeaderOpen] = useState(false);
  const dirty = JSON.stringify(layout) !== baseline;
  const previewUrl = useCallback((path: string) => `${props.imagePreviewBase}${encodeURIComponent(path)}`, [props.imagePreviewBase]);
  const productMap = useMemo(() => Object.fromEntries(props.products.map((p) => [p.id, { name: p.name, imageUrl: p.imageUrl, href: null, detail: p.detail }])), [props.products]);
  const data = useMemo<StorefrontBlocksData>(() => ({ statValues: props.statValues, markets: props.markets, products: productMap, imageUrl: previewUrl,
    categories: props.categories, certificates: props.certificates, sections: props.sections }),
  [props.statValues, props.markets, productMap, previewUrl, props.categories, props.certificates, props.sections]);

  // Tự lưu nháp 2,5 giây sau lần sửa cuối. Bản nháp người mua không thấy; Áp dụng vẫn bấm tay.
  const [autosave, setAutosave] = useState<{ state: "saving" | "saved" | "error"; text?: string } | null>(null);
  const failedLayout = useRef<StorefrontLayout | null>(null);
  const autosaving = autosave?.state === "saving";
  useEffect(() => {
    if (!dirty || busy || uploading || autosaving || failedLayout.current === layout) return;
    const timer = window.setTimeout(async () => {
      const snapshot = layoutRef.current;
      setAutosave({ state: "saving" });
      try {
        const result = await props.saveDraft(snapshot);
        if (result.ok) { setBaseline(JSON.stringify(snapshot)); setLive(false); setAutosave({ state: "saved" }); }
        else { failedLayout.current = snapshot; setAutosave({ state: "error", text: fill(copy.inline.autosaveFailed, { message: result.message }) }); }
      } catch { failedLayout.current = snapshot; setAutosave({ state: "error", text: fill(copy.inline.autosaveFailed, { message: copy.failed }) }); }
    }, 2500);
    return () => window.clearTimeout(timer);
    // Chạy lại khi bố cục đổi hoặc vừa lưu xong; lỗi thì đợi lần sửa tiếp theo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, busy, uploading, autosaving]);

  const onBlocks = useCallback((blocks: LayoutBlock[]) => {
    const next = { ...layoutRef.current, blocks };
    if (!settled.current) { settled.current = true; if (JSON.stringify(props.initial) === baseline) setBaseline(JSON.stringify(next)); }
    setLayout(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const proLocked = (type: LayoutBlockType) => !props.pro && PRO_ONLY_BLOCKS.includes(type);
  const canAdd = useCallback((type: LayoutBlockType, blocks: LayoutBlock[]) => !(!props.pro && PRO_ONLY_BLOCKS.includes(type)) && blocks.length < LAYOUT_MAX_BLOCKS
    && (type === "about" ? blocks.filter((b) => b.type === "about").length < LAYOUT_MAX_ABOUT : !blocks.some((b) => b.type === type)), [props.pro]);

  async function upload(file: File): Promise<string | null> {
    setUploading((n) => n + 1); setMessage(null);
    try {
      const prepared = await prepareImage(file);
      const body = new FormData();
      for (const [name, value] of Object.entries(props.uploadFields ?? {})) body.append(name, value);
      body.append("file", new File([prepared.main], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      const res = await fetch(props.uploadUrl, { method: "POST", body });
      const result = await res.json().catch(() => null) as { ok?: boolean; path?: string; message?: string } | null;
      if (!res.ok || !result?.ok || !result.path) throw new Error(result?.message || copy.errors.upload);
      return result.path;
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload });
      return null;
    } finally { setUploading((n) => n - 1); }
  }
  const uploadRef = useRef(upload);
  uploadRef.current = upload;

  const uploadVideo = async (file: File, onProgress: (pct: number) => void) => {
    const problem = await checkVideoFile(file, { video: copy.errors.videoFile, videoTooLong: copy.errors.videoTooLong, upload: copy.errors.upload }, fill);
    if (problem) throw new Error(problem);
    return uploadStreamVideoTo(props.uploadUrl, props.uploadFields ?? {}, file, onProgress, copy.errors.upload);
  };
  const uploadVideoRef = useRef(uploadVideo);
  uploadVideoRef.current = uploadVideo;

  async function run(kind: "save" | "apply") {
    if (kind === "apply" && !window.confirm(copy.confirmApply)) return;
    setBusy(kind); setMessage(null);
    try {
      const result = await (kind === "save" ? props.saveDraft(layout) : props.apply(layout));
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) { setAutosave(null); setBaseline(JSON.stringify(layout)); setLive(kind === "apply"); router.refresh(); }
    } catch { setMessage({ ok: false, text: copy.failed }); }
    finally { setBusy(null); }
  }

  function quickBuild() {
    if (!props.quick || !props.quick.blocks.length) { setMessage({ ok: false, text: copy.quick.empty }); return; }
    if (layout.blocks.length && !window.confirm(copy.quick.confirm)) return;
    const quick = props.quick;
    setLayout((l) => ({ ...l, tone: quick.tone, tagline: quick.tagline }));
    pageEditor.current?.replace(quick.blocks);
    setMessage({ ok: true, text: fill(copy.quick.done, { count: quick.blocks.length }) });
  }

  const inline: InlineCopy = copy.inline;
  const imageLimit = (b: LayoutBlock) => b.type === "banner" ? BANNER_MAX_IMAGES : b.type === "company" ? COMPANY_MAX_IMAGES : b.type === "gallery" ? GALLERY_MAX_IMAGES : 1;
  const imagesOf = (b: LayoutBlock): string[] => "images" in b && Array.isArray(b.images) ? b.images : [];
  const pro = props.pro;
  /** Sửa trực tiếp trên một mục: chữ, ảnh, video. */
  const editorFor = useCallback((patch: SectionPatch): BlockEditor => ({
    companyVideo: pro,
    text: (_b, field, value, o) => <InlineText value={value} onChange={(v) => patch({ [field]: v } as Partial<LayoutBlock>)}
      placeholder={o.placeholder} max={o.max} multiline={o.multiline} tone={o.tone} className={o.className} copy={inline} label={o.label} />,
    imageOverlay: (_b, field, index) => <ImageOverlay copy={inline}
      onReplace={async (file) => {
        const path = await uploadRef.current(file);
        if (!path) return;
        patch((current) => (field === "image_path" ? { image_path: path } : { images: imagesOf(current).map((x, i) => i === index ? path : x) }) as Partial<LayoutBlock>);
      }}
      onRemove={() => patch((current) => (field === "image_path" ? { image_path: "" } : { images: imagesOf(current).filter((_, i) => i !== index) }) as Partial<LayoutBlock>)} />,
    addImage: (b, field, className) => {
      if (field === "image_path" ? b.type === "about" && !!b.image_path : imagesOf(b).length >= imageLimit(b)) return null;
      return <AddImageTile copy={inline} className={className} onAdd={async (file) => {
        const path = await uploadRef.current(file);
        if (!path) return;
        patch((current) => (field === "image_path" ? { image_path: path }
          : { images: imagesOf(current).length < imageLimit(current) ? [...imagesOf(current), path] : imagesOf(current) }) as Partial<LayoutBlock>);
      }} />;
    },
    video: (b) => {
      if (b.type !== "video" && !(b.type === "company" && pro)) return null;
      const uid = b.type === "video" ? b.video_uid : b.video_uid ?? "";
      return <VideoPicker hasVideo={!!uid} copy={inline}
        onUpload={async (file, onProgress) => {
          try {
            const next = await uploadVideoRef.current(file, onProgress);
            patch({ video_uid: next, duration: undefined, uploaded_at: undefined } as Partial<LayoutBlock>);
          } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload }); }
        }}
        onRemove={() => patch((b.type === "video" ? { video_uid: "", duration: undefined, uploaded_at: undefined }
          : { video_uid: undefined, duration: undefined, uploaded_at: undefined }) as Partial<LayoutBlock>)} />;
    },
    companyText: props.profile ? () => <CompanyIntroEditor profile={props.profile!} copy={copy} /> : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pro, copy, props.profile]);

  const settings = useCallback((block: LayoutBlock, patch: SectionPatch) => <BlockSettings block={block} copy={copy}
    patch={(_id, change) => patch(change)} statValues={props.statValues} markets={props.markets}
    products={props.products} previewUrl={previewUrl} uploading={uploading ? block.id : null}
    upload={(_key, file) => uploadRef.current(file)}
    categories={props.categories} certificates={props.certificates} hasGallery={!!props.sections?.gallery} profile={props.profile} pro={props.pro}
    uploadVideo={(file, onProgress) => uploadVideoRef.current(file, onProgress)} />,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [copy, props.statValues, props.markets, props.products, previewUrl, uploading, props.categories, props.certificates, props.sections, props.profile, props.pro]);

  const emptyBlock = useCallback((b: LayoutBlock) => <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-4 py-5 text-sm">
    <p className="font-semibold text-ink-800">{copy.types[b.type].name}</p>
    <p className="mt-0.5 text-xs leading-5 text-ink-500">{copy.emptyBlock}</p>
  </div>, [copy]);

  const status = dirty ? copy.status.dirty : live ? copy.status.live : copy.status.draft;
  const tone = STOREFRONT_TONE_COLORS[layout.tone];

  return <div className="rounded-xl border border-ink-200 bg-white">
    {/* Thanh trên: trạng thái, hoàn tác, lưu, áp dụng */}
    <div className="sticky top-16 z-40 flex flex-wrap items-center gap-2 rounded-t-xl border-b border-ink-200 bg-white/95 px-4 py-3 backdrop-blur">
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${dirty || !live ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{status}</span>
      <span className="inline-flex rounded-lg border border-ink-200 p-0.5">
        <Tool label={copy.inline.undo} onClick={() => pageEditor.current?.undo()}><Undo2 className="size-4" /></Tool>
        <Tool label={copy.inline.redo} onClick={() => pageEditor.current?.redo()}><Redo2 className="size-4" /></Tool>
      </span>
      {autosave && <span role={autosave.state === "error" ? "alert" : "status"} className={`inline-flex items-center gap-1 text-xs font-semibold ${autosave.state === "error" ? "text-rose-700" : "text-ink-500"}`}>
        {autosave.state === "saving" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
        {autosave.state === "saving" ? copy.inline.autosaving : autosave.state === "saved" ? copy.inline.autosaved : autosave.text}
      </span>}
      {message && <span role={message.ok ? "status" : "alert"} className={`text-xs font-semibold ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</span>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" onClick={quickBuild} title={copy.quick.body} className="btn btn-soft btn-sm"><Sparkles className="size-3.5" aria-hidden="true" />{copy.quick.button}</button>
        {props.previewHref && <a href={props.previewHref} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">{copy.preview}<ExternalLink className="size-3.5" aria-hidden="true" /></a>}
        <button type="button" className="btn btn-soft btn-sm" disabled={!!busy || !!uploading || autosaving || !dirty} onClick={() => void run("save")}>{busy === "save" ? copy.saving : copy.save}</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !!uploading || autosaving || (live && !dirty)} onClick={() => void run("apply")}>{busy === "apply" ? copy.applying : props.applyLabel ?? copy.apply}</button>
      </div>
    </div>

    {props.aside && <div className="border-b border-ink-200 px-4 py-3">{props.aside}</div>}

    {/* Tông màu và thiết bị xem */}
    <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-4 py-2.5">
      <span className="text-xs font-semibold text-ink-600">{copy.editor.tone}</span>
      <div className="flex flex-wrap gap-1.5">
        {STOREFRONT_TONES.map((t) => <button key={t} type="button" aria-pressed={layout.tone === t} onClick={() => setLayout((l) => ({ ...l, tone: t }))}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${layout.tone === t ? "border-brand-600 bg-brand-50" : "border-ink-200"}`}>
          <span className="size-3 rounded-full" style={{ background: STOREFRONT_TONE_COLORS[t].accent }} />{copy.fields.tones[t]}</button>)}
      </div>
      <div role="group" aria-label={copy.device.label} className="ml-auto inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
        {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}
          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${device === d ? "bg-brand-700 text-white" : "text-ink-600"}`}>
          {d === "desktop" ? <Monitor className="size-3.5" aria-hidden="true" /> : <Smartphone className="size-3.5" aria-hidden="true" />}{copy.device[d]}
        </button>)}
      </div>
    </div>

    {/* Trang: đầu trang và tài liệu soạn thảo */}
    <div className="rounded-b-xl bg-ink-50 p-3 sm:p-5">
      <div className={`@container mx-auto rounded-xl bg-white px-3 py-4 shadow-sm ring-1 ring-ink-200 transition-[max-width] sm:px-8 sm:py-6 ${device === "mobile" ? "max-w-[430px]" : "max-w-[1040px]"}`}
        style={{ "--sf-accent": tone.accent, "--sf-dark": tone.dark, "--sf-tint": tone.tint } as CSSProperties}>
        <p className="mb-3 text-center text-[11.5px] text-ink-500">{copy.inline.hint}</p>
        <div data-block-id="__header__" className="relative">
          <HeaderPreview layout={layout} header={props.header} previewUrl={previewUrl} photos={!!props.profile}
            tagline={<InlineText value={layout.tagline} onChange={(tagline) => setLayout((l) => ({ ...l, tagline }))} tone="dark"
              placeholder="One line about your company, in English" max={STOREFRONT_TAGLINE_MAX} multiline copy={inline} label={copy.fields.tagline}
              className="text-[15px] leading-7 text-white/90 @2xl:text-lg" />} />
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10.5px] text-ink-600">{copy.headerLockHint}</span>
            {props.profile && <button type="button" onClick={() => setHeaderOpen((v) => !v)} aria-expanded={headerOpen}
              className="inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-700 hover:bg-white">
              <Settings2 className="size-3" aria-hidden="true" />{copy.editor.headerSettings}</button>}
          </div>
        </div>
        {headerOpen && props.profile && <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4 text-[12.5px]">
          <ProfileFields key="header" fields={PROFILE_FIELDS_BY_BLOCK.header} block="checks" profile={props.profile} copy={copy} />
        </div>}
        <div className="mt-6">
          <PageEditor handle={pageEditor} initial={props.initial.blocks} onChange={onBlocks} previewUrl={previewUrl} previewBase={props.imagePreviewBase}
            upload={(file) => uploadRef.current(file)} canAdd={canAdd} copy={copy} locale={copy.editor.locale === "vi" ? "vi" : "en"} data={data}
            editorFor={editorFor} settings={settings} emptyBlock={emptyBlock} />
        </div>
      </div>
    </div>
    {proLocked("video") && <p className="px-4 pb-3 text-center text-[11.5px] text-ink-500">{copy.proHint}: {copy.types.video.name}, {copy.types.categories.name}</p>}
  </div>;
}

function Tool({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className="rounded-md p-1 text-ink-500 hover:bg-white hover:text-ink-900 disabled:opacity-30">{children}</button>;
}

/** Đầu trang dùng đúng component của trang thật, nên xem trước khớp với trang công khai. */
function HeaderPreview({ layout, header, previewUrl, tagline, photos }: {
  layout: StorefrontLayout; header: { name: string; location: string; checks: string[]; avatarUrl: string | null; coverUrl?: string | null }; previewUrl: (path: string) => string;
  /** Ô sửa câu giới thiệu tại chỗ. */
  tagline?: ReactNode;
  /** Cổng nhà cung cấp: nút đổi, xoá ảnh bìa và ảnh đại diện ngay trên đầu trang. */
  photos?: boolean;
}) {
  // Giống trang thật: ảnh bìa làm nền, chưa có thì ảnh banner đầu tiên.
  const banner = layout.blocks.find((block) => block.type === "banner" && !block.hidden);
  const cover = header.coverUrl ?? (banner?.type === "banner" && banner.images[0] ? previewUrl(banner.images[0]) : null);
  const round = "flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/95 text-ink-800 shadow-md transition hover:bg-white disabled:opacity-60";
  return <PremiumHeader name={header.name} nameTag="h2" location={header.location} tagline={layout.tagline} taglineNode={tagline} coverUrl={cover} avatarUrl={header.avatarUrl}
    coverAction={photos ? <div className="absolute bottom-3 right-3 z-10 flex gap-1.5" onClick={(event) => event.stopPropagation()}>
      {header.coverUrl && <SupplierCoverDeleteButton className={`${round} text-rose-700`} />}
      <SupplierPhotoButton kind="cover" hasImage={!!header.coverUrl} className={round} />
    </div> : undefined}
    avatarAction={photos ? <div className="absolute -bottom-2 -right-2 z-10" onClick={(event) => event.stopPropagation()}>
      <SupplierPhotoButton kind="profile" hasImage={!!header.avatarUrl} className="flex size-7 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-800 shadow-md disabled:opacity-60" />
    </div> : undefined}
    checks={<div className="flex flex-wrap gap-2">{header.checks.map((check) => <span key={check} className="rounded-full bg-success-surface px-3 py-1 text-xs font-semibold text-success">{check}</span>)}</div>}
    actions={<span className="inline-flex items-center justify-center rounded-lg bg-[var(--sf-accent)] px-5 py-2.5 text-sm font-bold text-white">Request a quote</span>} />;
}

function Counter({ value, max, copy }: { value: string; max: number; copy: DesignerMessages }) {
  return <span className={`mt-1 block text-[11px] ${value.length > max ? "text-rose-700" : "text-ink-400"}`}>{fill(copy.fields.chars, { count: value.length, max })}</span>;
}



function BlockSettings(props: Parameters<typeof BlockSettingsInner>[0] & { profile?: { values: ProfileValues; save: (patch: StorefrontProfilePatch) => Promise<DesignerResult> } }) {
  const fields = props.profile ? PROFILE_FIELDS_BY_BLOCK[props.block.type] : undefined;
  return <>
    <BlockSettingsInner {...props} portal={!!props.profile} />
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

function BlockSettingsInner({ block, patch, copy, statValues, markets, products, previewUrl, upload, uploading, categories, certificates, uploadVideo, hasGallery, portal = false, pro = true }: {
  /** Gói Pro: mở video giới thiệu trong khối Giới thiệu công ty. */
  pro?: boolean;
  /** Cổng nhà cung cấp: hiện đường dẫn tới trang sửa nội dung tự lấy (chứng nhận, sản phẩm, xác minh). */
  portal?: boolean;
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
      {portal && <PortalLink href="/supplier/portal/products" label={copy.links.products} />}
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
      <VideoSettings uid={block.video_uid} title={block.title} copy={copy} uploadVideo={uploadVideo}
        onUid={(uid) => patch(block.id, { video_uid: uid, duration: undefined, uploaded_at: undefined })}
        onTitle={(title) => patch(block.id, { title })} />
    </>;
    case "categories": return <>
      {title}
      <p className="leading-5 text-ink-600">{categories.length >= 2 ? copy.fields.categoriesHelp : copy.fields.categoriesEmpty}</p>
      {categories.length >= 2 && <ul className="space-y-1 text-ink-800">{categories.map((c) => <li key={c.name}>{c.name} · {c.count}</li>)}</ul>}
      {portal && <PortalLink href="/supplier/portal/products" label={copy.links.products} />}
    </>;
    case "company": {
      const images = block.images ?? [];
      return <>
        {title}
        <p className="leading-5 text-ink-600">{copy.fields.companyHelp}</p>
        <div>
          <p className="mb-1 font-semibold text-ink-700">{fill(copy.about.images, { max: COMPANY_MAX_IMAGES })}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {images.map((path) => <div key={path} className="relative aspect-square overflow-hidden rounded-md border border-ink-200 bg-ink-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl(path)} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label={copy.fields.removeImage} onClick={() => patch(block.id, { images: images.filter((x) => x !== path) })}
                className="absolute right-1 top-1 rounded-full bg-white/95 p-0.5 text-rose-700 shadow"><X className="size-3" /></button>
            </div>)}
            {images.length < COMPANY_MAX_IMAGES && <ImageInput label={copy.fields.addImage} busy={uploading === block.id}
              onFile={async (file) => { const path = await upload(block.id, file); if (path) patch(block.id, { images: [...images, path] }); }} />}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">{copy.about.imagesHint}</p>
        </div>
        {pro ? <VideoSettings uid={block.video_uid ?? ""} title={block.video_title ?? ""} copy={copy} uploadVideo={uploadVideo}
            onUid={(uid) => patch(block.id, { video_uid: uid, duration: undefined, uploaded_at: undefined })}
            onTitle={(videoTitle) => patch(block.id, { video_title: videoTitle })}
            onRemove={() => patch(block.id, { video_uid: undefined, video_title: undefined, duration: undefined, uploaded_at: undefined })} />
          : <p className="rounded-md bg-brand-50 p-2 text-[11.5px] leading-5 text-brand-900">{copy.about.videoPro}</p>}
        <p className="rounded-md bg-ink-50 p-2 text-[11.5px] leading-5 text-ink-600">{copy.about.tip}</p>
      </>;
    }
    case "checks": return <>{title}<p className="rounded-md bg-ink-50 p-2 leading-5 text-ink-600">{copy.requiredHint}</p>
      {portal && <PortalLink href="/supplier/portal/storefront#supplier-verification-actions" label={copy.links.checks} />}</>;
    case "trade": return <>{title}<p className="leading-5 text-ink-600">{copy.fields.tradeHelp}</p></>;
    case "details": return <>{title}<p className="leading-5 text-ink-600">{copy.fields.detailsHelp}</p></>;
    case "gallery": {
      const images = block.images ?? [];
      return <>
        {title}
        <div>
          <p className="mb-1 font-semibold text-ink-700">{fill(copy.gallery.images, { max: GALLERY_MAX_IMAGES })}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {images.map((path) => <div key={path} className="relative aspect-square overflow-hidden rounded-md border border-ink-200 bg-ink-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl(path)} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label={copy.fields.removeImage} onClick={() => patch(block.id, { images: images.filter((x) => x !== path) })}
                className="absolute right-1 top-1 rounded-full bg-white/95 p-0.5 text-rose-700 shadow"><X className="size-3" /></button>
            </div>)}
            {images.length < GALLERY_MAX_IMAGES && <ImageInput label={copy.fields.addImage} busy={uploading === block.id}
              onFile={async (file) => { const path = await upload(block.id, file); if (path) patch(block.id, { images: [...images, path] }); }} />}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-ink-500">{copy.gallery.hint}</p>
        </div>
        {!images.length && hasGallery && <p className="rounded-md bg-ink-50 p-2 text-[11.5px] leading-5 text-ink-600">{copy.gallery.shared}</p>}
      </>;
    }
    case "certificates": return <>
      {title}
      <p className="leading-5 text-ink-600">{certificates.length ? copy.fields.certificatesHelp : copy.fields.certificatesEmpty}</p>
      {certificates.length > 0 && <ul className="space-y-1 text-ink-800">{certificates.map((c) => <li key={`${c.name}-${c.detail}`}>{c.name}{c.detail ? ` · ${c.detail}` : ""}</li>)}</ul>}
      {portal && <PortalLink href="/supplier/portal/documents#chung-nhan" label={copy.links.certificates} />}
    </>;
  }
}

/** Tải, thay và xoá video (dùng cho khối Video nhà máy và video giới thiệu trong khối Giới thiệu). */
function VideoSettings({ uid, title, onUid, onTitle, onRemove, copy, uploadVideo }: {
  uid: string;
  title: string;
  onUid: (uid: string) => void;
  onTitle: (title: string) => void;
  onRemove?: () => void;
  copy: DesignerMessages;
  uploadVideo: (file: File, onProgress: (pct: number) => void) => Promise<string>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  return <>
    <div>
      <p className="mb-1 font-semibold text-ink-700">{copy.fields.video}</p>
      {uid && <div className="aspect-video overflow-hidden rounded-md border border-ink-200 bg-black">
        <iframe src={aplusVideoEmbedUrl(uid)} title={title || copy.fields.video} allow="accelerometer; gyroscope; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full border-0" />
      </div>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" disabled={progress !== null} onClick={() => input.current?.click()} className="btn btn-soft btn-sm">
          {progress !== null ? <><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{fill(copy.fields.uploadingPct, { pct: progress })}</> : uid ? copy.fields.replaceVideo : copy.fields.chooseVideo}
        </button>
        {uid && onRemove && <button type="button" disabled={progress !== null} onClick={onRemove} className="btn btn-sm border-rose-200 text-rose-700">{copy.about.removeVideo}</button>}
      </div>
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (!file) return;
          setNote(null); setProgress(0);
          try {
            onUid(await uploadVideo(file, setProgress));
            setNote({ ok: true, text: copy.fields.videoProcessing });
          } catch (error) { setNote({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload }); }
          finally { setProgress(null); }
        }} />
      <p className="mt-1 text-[11px] leading-4 text-ink-500">{copy.fields.videoHint}</p>
      {note && <p role={note.ok ? "status" : "alert"} className={`mt-1 text-[11.5px] font-semibold ${note.ok ? "text-emerald-700" : "text-rose-700"}`}>{note.text}</p>}
    </div>
    {uid && <label className="block font-semibold text-ink-700">{copy.fields.videoTitle}
      <input value={title} onChange={(e) => onTitle(e.target.value)} className="input mt-1 w-full font-normal" />
      <Counter value={title} max={VIDEO_TITLE_MAX} copy={copy} />
    </label>}
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

/** Đường dẫn tới trang sửa nội dung mà khối tự lấy (mở tab mới để không mất bản nháp đang soạn). */
function PortalLink({ href, label }: { href: string; label: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-soft btn-sm">{label}<ExternalLink className="size-3.5" aria-hidden="true" /></a>;
}


/**
 * Sửa phần giới thiệu ngay trong khối Giới thiệu công ty (chỉ cổng nhà cung cấp). Phần này lấy từ
 * Hồ sơ công ty: nhà cung cấp viết tiếng Việt, máy chủ dịch sang tiếng Anh khi lưu.
 */
function CompanyIntroEditor({ profile, copy }: { profile: { values: ProfileValues; save: (patch: StorefrontProfilePatch) => Promise<DesignerResult> }; copy: DesignerMessages }) {
  const router = useRouter();
  const t = copy.inline;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(profile.values.intro_source ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const max = STOREFRONT_PROFILE_FIELDS.intro_source.kind === "text" ? STOREFRONT_PROFILE_FIELDS.intro_source.max : 4000;
  if (!open) return <div className="mt-4" onClick={(event) => event.stopPropagation()}>
    <button type="button" className="btn btn-soft btn-sm" onClick={() => { setValue(profile.values.intro_source ?? ""); setNote(null); setOpen(true); }}>
      <Pencil className="size-3.5" aria-hidden="true" />{t.introEdit}
    </button>
    {note && <p role="status" className="mt-2 text-[11.5px] font-semibold text-emerald-700">{note.text}</p>}
  </div>;
  return <div className="mt-4 space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3" onClick={(event) => event.stopPropagation()}>
    <p className="text-[11.5px] leading-5 text-ink-600">{t.introNote}</p>
    <textarea rows={7} value={value} onChange={(event) => setValue(event.target.value)} aria-label={copy.profile.fields.intro_source} className="input w-full text-[13.5px]" />
    <Counter value={value} max={max} copy={copy} />
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || value === (profile.values.intro_source ?? "")} onClick={async () => {
        setBusy(true); setNote(null);
        const result = await profile.save({ intro_source: value }).catch(() => ({ ok: false, message: copy.failed }));
        setBusy(false); setNote({ ok: result.ok, text: result.message });
        if (result.ok) { setOpen(false); router.refresh(); }
      }}>{busy ? t.introSaving : t.introSave}</button>
      <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => setOpen(false)}>{t.cancel}</button>
    </div>
    {note && !note.ok && <p role="alert" className="text-[11.5px] font-semibold text-rose-700">{note.text}</p>}
  </div>;
}
