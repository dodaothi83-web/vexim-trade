"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Columns2, GalleryHorizontal, Image as ImageIcon, Loader2, Lock, Plus, Trash2, Type, Video } from "lucide-react";

import { fill } from "@/lib/i18n/format";
import type { AplusMessages } from "@/lib/i18n/portal/aplus";
import { prepareImage } from "@/lib/media/client-image";
import { checkVideoFile, uploadStreamVideo } from "@/lib/media/stream-upload-client";
import { APLUS_BODY_MAX, APLUS_CAPTION_MAX, APLUS_GALLERY_MAX, APLUS_MAX_MODULES, APLUS_TITLE_MAX, aplusVideoEmbedUrl,
  type AplusModule, type AplusModuleType } from "@/lib/products/aplus";
import { saveProductAplusAction } from "@/app/supplier/portal/aplus-actions";

const ICONS: Record<AplusModuleType, typeof ImageIcon> = { image: ImageIcon, image_text: Columns2, gallery: GalleryHorizontal, text: Type, video: Video };

/** Khối đang soạn: cho phép thiếu ảnh/video tạm thời, máy chủ kiểm tra khi lưu. */
type Draft =
  | { id: string; type: "image"; image_path: string; caption: string }
  | { id: string; type: "image_text"; image_path: string; title: string; body: string; image_side: "left" | "right" }
  | { id: string; type: "gallery"; items: Array<{ image_path: string; caption: string }> }
  | { id: string; type: "text"; title: string; body: string }
  | { id: string; type: "video"; video_uid: string; title: string };

function newDraft(type: AplusModuleType): Draft {
  const id = crypto.randomUUID();
  switch (type) {
    case "image": return { id, type, image_path: "", caption: "" };
    case "image_text": return { id, type, image_path: "", title: "", body: "", image_side: "left" };
    case "gallery": return { id, type, items: [{ image_path: "", caption: "" }, { image_path: "", caption: "" }] };
    case "text": return { id, type, title: "", body: "" };
    case "video": return { id, type, video_uid: "", title: "" };
  }
}

/**
 * Khu "Nội dung A+" dưới mô tả chi tiết. Gói Basic thấy lời mời nâng gói; gói có quyền thì thêm,
 * sắp xếp, sửa và xoá khối. Ảnh tải lên ngay khi chọn, video gửi thẳng tới Cloudflare Stream;
 * nội dung chỉ đổi cho người mua khi bấm Lưu. Không có ô nào mang `name`, để form sản phẩm
 * bao quanh không gửi kèm các trường này.
 */
export function AplusEditor({ productId, allowed, editable, initial, copy }: {
  /** null khi sản phẩm chưa được tạo. */
  productId: string | null;
  allowed: boolean;
  editable: boolean;
  initial: AplusModule[];
  copy: AplusMessages;
}) {
  const router = useRouter();
  const [modules, setModules] = useState<Draft[]>(initial as Draft[]);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const dirty = JSON.stringify(modules) !== saved;
  const disabled = !editable || busy || !!uploading;

  if (!allowed) {
    return <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/70 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Lock className="size-4 text-brand-700" aria-hidden="true" />{copy.lockedTitle}</p>
      <p className="mt-1 text-xs leading-5 text-ink-600">{copy.lockedBody}</p>
      <Link href="/supplier/portal/storefront" className="mt-2 inline-block text-xs font-bold text-brand-700 underline">{copy.lockedCta}</Link>
    </div>;
  }

  const update = (id: string, patch: Partial<Draft>) => setModules((all) => all.map((m) => m.id === id ? { ...m, ...patch } as Draft : m));
  const move = (index: number, direction: -1 | 1) => setModules((all) => {
    const next = [...all]; const target = index + direction;
    if (target < 0 || target >= next.length) return all;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const preview = (path: string) => productId && path ? `/api/supplier-portal/products/${productId}/aplus?path=${encodeURIComponent(path)}` : "";

  async function uploadImage(key: string, file: File): Promise<string | null> {
    if (!productId) return null;
    setUploading(key); setMessage(null);
    try {
      const prepared = await prepareImage(file);
      const body = new FormData();
      body.append("kind", "image");
      body.append("file", new File([prepared.main], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      const res = await fetch(`/api/supplier-portal/products/${productId}/aplus`, { method: "POST", body });
      const data = await res.json().catch(() => null) as { ok?: boolean; path?: string; message?: string } | null;
      if (!res.ok || !data?.ok || !data.path) throw new Error(data?.message || copy.errors.upload);
      return data.path;
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload });
      return null;
    } finally { setUploading(null); }
  }

  async function uploadVideo(id: string, file: File) {
    if (!productId) return;
    const problem = await checkVideoFile(file, copy.errors, fill);
    if (problem) { setMessage({ ok: false, text: problem }); return; }
    setUploading(id); setProgress(0); setMessage(null);
    try {
      const uid = await uploadStreamVideo(productId, file, setProgress, copy.errors.upload);
      update(id, { video_uid: uid });
      setMessage({ ok: true, text: copy.fields.videoProcessing });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload });
    } finally { setUploading(null); setProgress(null); }
  }

  async function save() {
    if (!productId || disabled) return;
    setBusy(true); setMessage(null);
    try {
      const result = await saveProductAplusAction(productId, modules);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) { setSaved(JSON.stringify(modules)); router.refresh(); }
    } catch { setMessage({ ok: false, text: copy.errors.failed }); }
    finally { setBusy(false); }
  }

  const field = "input mt-1 w-full";
  const imagePicker = (key: string, path: string, onPicked: (path: string) => void) => (
    <ImagePicker key={key} src={preview(path)} busy={uploading === key} disabled={disabled}
      label={path ? copy.fields.replaceImage : copy.fields.chooseImage}
      onFile={async (file) => { const uploaded = await uploadImage(key, file); if (uploaded) onPicked(uploaded); }} />
  );

  return <div className="mt-5 rounded-lg border border-ink-200" onChange={(event) => event.stopPropagation()} onInput={(event) => event.stopPropagation()}>
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink-100 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink-900">{copy.title}</p>
        <p className="mt-0.5 text-[11.5px] leading-5 text-ink-500">{copy.sub}</p>
      </div>
      <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800">{fill(copy.count, { count: modules.length, max: APLUS_MAX_MODULES })}</span>
    </div>
    {!productId ? <p className="px-4 py-3 text-xs text-ink-600">{copy.saveFirst}</p> : <div className="space-y-3 px-4 py-3">
      {!editable && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{copy.locked}</p>}
      {modules.map((module, index) => {
        const Icon = ICONS[module.type];
        return <section key={module.id} aria-label={copy.types[module.type]} className="rounded-lg border border-ink-200 bg-ink-50/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-800"><Icon className="size-4 text-brand-700" aria-hidden="true" />{index + 1}. {copy.types[module.type]}</p>
            <div className="flex items-center gap-1">
              <IconButton label={copy.moveUp} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-4" /></IconButton>
              <IconButton label={copy.moveDown} disabled={disabled || index === modules.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-4" /></IconButton>
              <IconButton label={copy.remove} disabled={disabled} onClick={() => setModules((all) => all.filter((m) => m.id !== module.id))}><Trash2 className="size-4" /></IconButton>
            </div>
          </div>
          {module.type === "image" && <div className="space-y-2">
            {imagePicker(module.id, module.image_path, (path) => update(module.id, { image_path: path }))}
            <input aria-label={copy.fields.caption} placeholder={copy.fields.caption} value={module.caption} maxLength={APLUS_CAPTION_MAX} disabled={disabled}
              onChange={(e) => update(module.id, { caption: e.target.value })} className={field} />
          </div>}
          {module.type === "image_text" && <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-2">
              {imagePicker(module.id, module.image_path, (path) => update(module.id, { image_path: path }))}
              <label className="block text-[11.5px] font-semibold text-ink-700">{copy.fields.imageSide}
                <select value={module.image_side} disabled={disabled} onChange={(e) => update(module.id, { image_side: e.target.value === "right" ? "right" : "left" })} className={field}>
                  <option value="left">{copy.fields.left}</option><option value="right">{copy.fields.right}</option>
                </select>
              </label>
            </div>
            <div className="space-y-2">
              <input aria-label={copy.fields.title} placeholder={copy.fields.title} value={module.title} maxLength={APLUS_TITLE_MAX} disabled={disabled}
                onChange={(e) => update(module.id, { title: e.target.value })} className={field} />
              <textarea aria-label={copy.fields.body} placeholder={copy.fields.body} value={module.body} maxLength={APLUS_BODY_MAX} rows={5} disabled={disabled}
                onChange={(e) => update(module.id, { body: e.target.value })} className={field} />
            </div>
          </div>}
          {module.type === "gallery" && <div className="grid gap-3 sm:grid-cols-2">
            {module.items.map((item, i) => <div key={i} className="space-y-1.5">
              {imagePicker(`${module.id}-${i}`, item.image_path, (path) => update(module.id, { items: module.items.map((x, j) => j === i ? { ...x, image_path: path } : x) }))}
              <div className="flex gap-1.5">
                <input aria-label={copy.fields.caption} placeholder={copy.fields.caption} value={item.caption} maxLength={APLUS_CAPTION_MAX} disabled={disabled}
                  onChange={(e) => update(module.id, { items: module.items.map((x, j) => j === i ? { ...x, caption: e.target.value } : x) })} className="input min-w-0 flex-1" />
                {module.items.length > 2 && <IconButton label={copy.remove} disabled={disabled}
                  onClick={() => update(module.id, { items: module.items.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></IconButton>}
              </div>
            </div>)}
            {module.items.length < APLUS_GALLERY_MAX && <button type="button" disabled={disabled}
              onClick={() => update(module.id, { items: [...module.items, { image_path: "", caption: "" }] })}
              className="flex min-h-24 items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-300 text-xs font-semibold text-brand-700 hover:bg-white">
              <Plus className="size-4" aria-hidden="true" />{copy.fields.addImage}</button>}
          </div>}
          {module.type === "text" && <div className="space-y-2">
            <input aria-label={copy.fields.title} placeholder={copy.fields.title} value={module.title} maxLength={APLUS_TITLE_MAX} disabled={disabled}
              onChange={(e) => update(module.id, { title: e.target.value })} className={field} />
            <textarea aria-label={copy.fields.body} placeholder={copy.fields.body} value={module.body} maxLength={APLUS_BODY_MAX} rows={4} disabled={disabled}
              onChange={(e) => update(module.id, { body: e.target.value })} className={field} />
          </div>}
          {module.type === "video" && <div className="space-y-2">
            {module.video_uid
              ? <div className="aspect-video overflow-hidden rounded-lg bg-black"><iframe src={aplusVideoEmbedUrl(module.video_uid)} title={module.title || copy.types.video}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full border-0" /></div>
              : null}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50">
              {uploading === module.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Video className="size-4" aria-hidden="true" />}
              {uploading === module.id ? (progress !== null ? fill(copy.uploadingPct, { pct: progress }) : copy.uploading) : copy.fields.chooseVideo}
              <input type="file" accept="video/mp4,video/quicktime,video/webm" disabled={disabled} className="sr-only"
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void uploadVideo(module.id, file); }} />
            </label>
            <input aria-label={copy.fields.videoTitle} placeholder={copy.fields.videoTitle} value={module.title} maxLength={APLUS_TITLE_MAX} disabled={disabled}
              onChange={(e) => update(module.id, { title: e.target.value })} className={field} />
          </div>}
        </section>;
      })}

      {modules.length < APLUS_MAX_MODULES && (adding
        ? <div className="flex flex-wrap gap-1.5 rounded-lg border border-dashed border-ink-300 p-2">
          {(Object.keys(ICONS) as AplusModuleType[]).map((type) => { const Icon = ICONS[type]; return (
            <button key={type} type="button" disabled={disabled} onClick={() => { setModules((all) => [...all, newDraft(type)]); setAdding(false); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:border-brand-400 hover:text-brand-800">
              <Icon className="size-4" aria-hidden="true" />{copy.types[type]}</button>); })}
        </div>
        : <button type="button" disabled={disabled} onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:underline"><Plus className="size-4" aria-hidden="true" />{copy.add}</button>)}

      <p className="text-[11px] leading-4 text-ink-500">{copy.hint}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={disabled || !dirty} className="btn btn-primary btn-sm">{busy ? copy.saving : copy.save}</button>
        {dirty && !busy && <span className="text-xs font-semibold text-amber-800">{copy.unsaved}</span>}
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
    </div>}
  </div>;
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className="rounded-md p-1.5 text-ink-500 hover:bg-white hover:text-ink-900 disabled:opacity-40">{children}</button>;
}

function ImagePicker({ src, busy, disabled, label, onFile }: { src: string; busy: boolean; disabled: boolean; label: string; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="space-y-1.5">
    {src
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt="" className="aspect-[16/9] w-full rounded-lg object-cover ring-1 ring-ink-200" />
      : <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg border border-dashed border-ink-300 bg-white text-ink-400"><ImageIcon className="size-7" aria-hidden="true" /></div>}
    <button type="button" disabled={disabled} onClick={() => input.current?.click()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-4" aria-hidden="true" />}{label}
    </button>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onFile(file); }} />
  </div>;
}

