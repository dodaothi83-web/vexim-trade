"use client";

import Link from "next/link";
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronUp, Image as ImageIcon, LayoutTemplate, Loader2, Lock, Monitor, Plus, Smartphone, Trash2, Video, X } from "lucide-react";

import { VeximIcon } from "@/components/brand/vexim-icons";
import { AplusRichEditor } from "./aplus-rich-editor";
import { ProductAplus } from "@/components/public/product-aplus";
import { fill } from "@/lib/i18n/format";
import type { AplusMessages } from "@/lib/i18n/portal/aplus";
import { prepareImage } from "@/lib/media/client-image";
import { aplusUploadEndpoint, checkVideoFile, uploadStreamVideoAt } from "@/lib/media/stream-upload-client";
import {
  APLUS_B2B_TYPES, APLUS_HIGHLIGHT_ICONS, APLUS_ITEM_RANGE, APLUS_MAX_MODULES, APLUS_MODULE_TYPES, aplusBlockIssues, aplusCompleteness,
  aplusModuleText, aplusNeedsTranslation, aplusNumberDrift, aplusSlots, aplusHasVietnamese, aplusTranslationStale, findContact, withAplusText,
  type AplusHighlightIcon, type AplusModule, type AplusModuleType,
} from "@/lib/products/aplus";
import { APLUS_TEMPLATE_IDS, APLUS_TEMPLATES, buildAplusTemplate, emptyAplusModule, type AplusTemplateId } from "@/lib/products/aplus-templates";
import { saveProductAplusAction, translateAplusPreviewAction, type AplusSaveResult } from "@/app/supplier/portal/aplus-actions";

/**
 * Nơi lưu, dịch thử, tải tệp của trình soạn. Mặc định là A+ của một sản phẩm; trang A+ doanh nghiệp
 * truyền các hàm của mình (app/supplier/portal/storefront/company-aplus-actions.ts).
 */
export type AplusEditorApi = {
  endpoint: string;
  save: (modules: AplusModule[], retranslate: string[]) => Promise<AplusSaveResult>;
  translate: (modules: AplusModule[], retranslate: string[]) => Promise<AplusSaveResult>;
};

export type AplusEditorHandle = {
  /** Lưu A+ cùng lần lưu sản phẩm. Trả false nếu lưu lỗi (lời nhắn hiện trong khu A+). */
  save: () => Promise<boolean>;
  dirty: () => boolean;
};

/** Khung ảnh từng loại khối: cùng tỉ lệ với trang người mua (null: ảnh giữ nguyên tỉ lệ). */
const RATIO: Partial<Record<AplusModuleType, { css: string; label: string }>> = {
  hero: { css: "97 / 36", label: "97:36" }, packing: { css: "4 / 3", label: "4:3" }, image_text: { css: "4 / 3", label: "4:3" },
  gallery: { css: "1 / 1", label: "1:1" }, steps: { css: "1 / 1", label: "1:1" },
};

/**
 * Trình soạn "Nội dung A+" (bản duyệt docs/aplus-editor, màn 1–3): trái soạn từng khối bằng tiếng
 * Việt, phải xem trước trực tiếp bản tiếng Anh người mua thấy (máy tính / điện thoại). Thư viện khối
 * có minh hoạ bố cục, bộ mẫu theo ngành hàng, khung ảnh đúng tỉ lệ kèm chọn vùng hiển thị và mô tả
 * ảnh, thanh mức hoàn thiện. Chuyển sang "English" để sửa tay bản tiếng Anh (có kiểm soát: nhắc dịch
 * lại khi bản tiếng Việt đổi, cảnh báo số liệu lệch).
 *
 * Lưu cùng sản phẩm: trang sửa sản phẩm gọi `handle.save()` khi bấm Lưu. Sản phẩm mới (chưa có
 * `productId`): ảnh, video tải vào khu chờ và cả nội dung đi theo form qua ô ẩn `pending_aplus_json`.
 * Không có ô nào mang `name` khác, để form sản phẩm bao quanh không gửi kèm các trường này.
 */
export function AplusEditor({ productId, allowed, editable, initial, copy, handle, onDirtyChange, api, templateIds = APLUS_TEMPLATE_IDS, heading, standalone = false, lockedHref = "/supplier/portal/storefront", previewWidths = { desktop: 1088, mobile: 350 } }: {
  /**
   * Bề rộng nội dung A+ trên trang thật (px): mặc định trang sản phẩm (khung 72rem, lề 2rem: 1088;
   * điện thoại 390 trừ lề: 350). A+ doanh nghiệp nằm trong cột trái trang nhà cung cấp: 824 / 318.
   */
  previewWidths?: { desktop: number; mobile: number };
  /** A+ doanh nghiệp: nơi lưu, dịch, tải tệp riêng (mặc định: A+ sản phẩm `productId`). */
  api?: AplusEditorApi;
  /** Bộ mẫu hiện trong "Bộ mẫu". */
  templateIds?: readonly AplusTemplateId[];
  /** Tiêu đề, mô tả và chữ khi chưa có quyền (A+ doanh nghiệp dùng chữ riêng). */
  heading?: { title: string; sub: string; lockedTitle: string; lockedBody: string; save: string };
  /** Trang riêng (A+ doanh nghiệp): có nút Lưu của mình thay vì lưu cùng form sản phẩm. */
  standalone?: boolean;
  lockedHref?: string;
  /** Báo trang sửa sản phẩm có thay đổi A+ chưa lưu (hiện nút Lưu, nhắc khi rời trang). */
  onDirtyChange?: (dirty: boolean) => void;
  /** null khi sản phẩm chưa được tạo. */
  productId: string | null;
  allowed: boolean;
  editable: boolean;
  initial: AplusModule[];
  copy: AplusMessages;
  handle?: Ref<AplusEditorHandle>;
}) {
  // Khối không có bản tiếng Việt là khối viết thẳng tiếng Anh: sửa ở tab English, không cần dịch.
  const [modules, setModules] = useState<AplusModule[]>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(modules));
  const [retranslate, setRetranslate] = useState<string[]>([]);
  // Tab mở đầu: theo nội dung đã có; trang trống thì theo ngôn ngữ cổng (nhà cung cấp nước ngoài viết tiếng Anh).
  const [mode, setMode] = useState<"vi" | "en">(() => initial.some(aplusHasVietnamese) ? "vi"
    : initial.length ? "en" : copy.defaultMode === "en" ? "en" : "vi");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [openId, setOpenId] = useState<string | null>(modules[0]?.id ?? null);
  const [panel, setPanel] = useState<"library" | "templates" | null>(null);
  const [busy, setBusy] = useState<"save" | "translate" | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const modulesRef = useRef(modules);
  modulesRef.current = modules;
  const dirty = JSON.stringify(modules) !== saved;
  const disabled = !editable || !!busy || !!uploading;
  const pending = !productId && !api;
  const endpoint = api?.endpoint ?? aplusUploadEndpoint(productId);
  const saveApi = api?.save ?? ((list: AplusModule[], again: string[]) => saveProductAplusAction(productId!, list, again));
  const translateApi = api?.translate ?? ((list: AplusModule[], again: string[]) => translateAplusPreviewAction(productId, list, again));
  const title = heading?.title ?? copy.title, sub = heading?.sub ?? copy.sub;
  useEffect(() => { if (!pending) onDirtyChange?.(dirty); }, [dirty, pending, onDirtyChange]);
  const preview = (path: string) => path ? `${endpoint}?path=${encodeURIComponent(path)}` : "";

  async function saveNow(): Promise<boolean> {
    if (pending || JSON.stringify(modulesRef.current) === saved) return true;
    setBusy("save"); setMessage(null);
    try {
      const result = await saveApi(modulesRef.current, retranslate);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok && result.modules) { setModules(result.modules); setSaved(JSON.stringify(result.modules)); setRetranslate([]); }
      return result.ok;
    } catch { setMessage({ ok: false, text: copy.errors.failed }); return false; }
    finally { setBusy(null); }
  }
  const saveRef = useRef(saveNow);
  saveRef.current = saveNow;
  useImperativeHandle(handle, () => ({
    dirty: () => JSON.stringify(modulesRef.current) !== saved,
    save: () => saveRef.current(),
  }), [saved]);

  const completeness = useMemo(() => aplusCompleteness(modules), [modules]);
  const done = completeness.filter((c) => c.done).length;

  if (!allowed) {
    return <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/70 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Lock className="size-4 text-brand-700" aria-hidden="true" />{heading?.lockedTitle ?? copy.lockedTitle}</p>
      <p className="mt-1 text-xs leading-5 text-ink-600">{heading?.lockedBody ?? copy.lockedBody}</p>
      <Link href={lockedHref} className="mt-2 inline-block text-xs font-bold text-brand-700 underline">{copy.lockedCta}</Link>
    </div>;
  }

  const replace = (id: string, fn: (module: AplusModule) => AplusModule) => setModules((all) => all.map((m) => m.id === id ? fn(m) : m));
  /** Sửa một ô chữ: chế độ tiếng Việt ghi bản tiếng Việt; chế độ English ghi bản tiếng Anh và đánh dấu đã sửa tay. */
  const setSlot = (id: string, key: string, value: string) => replace(id, (m) => {
    const slots = aplusSlots(m);
    const i = slots.findIndex((slot) => slot.key === key);
    if (i < 0) return m;
    if (mode === "vi") {
      const vi = [...(m.vi ?? slots.map(() => ""))];
      vi[i] = value;
      return { ...m, vi };
    }
    const english = aplusModuleText(m);
    english[i] = value;
    return { ...withAplusText(m, english), en_edited: true };
  });
  const slotValue = (m: AplusModule, key: string) => {
    const slots = aplusSlots(m);
    const i = slots.findIndex((slot) => slot.key === key);
    if (i < 0) return "";
    return mode === "vi" ? (m.vi?.[i] ?? "") : slots[i].get(m);
  };
  /** Thay đổi cấu trúc (thêm, bớt mục) giữ đúng bản tiếng Việt theo khoá ô chữ. */
  const restructure = (id: string, fn: (module: AplusModule) => AplusModule, removed?: { list: string; index: number }) => replace(id, (m) => {
    const before = new Map(aplusSlots(m).map((slot, i) => [slot.key, m.vi?.[i] ?? ""] as const));
    const next = fn(m);
    const shift = (key: string) => {
      if (!removed) return key;
      const parts = key.split(".");
      if (parts[0] !== removed.list) return key;
      const n = Number(parts[1]);
      return n >= removed.index ? `${parts[0]}.${n + 1}.${parts[2]}` : key;
    };
    return { ...next, vi: aplusSlots(next).map((slot) => before.get(shift(slot.key)) ?? "") };
  });
  const move = (index: number, direction: -1 | 1) => setModules((all) => {
    const next = [...all]; const target = index + direction;
    if (target < 0 || target >= next.length) return all;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const addModule = (type: AplusModuleType) => {
    const module = emptyAplusModule(type, crypto.randomUUID());
    setModules((all) => [...all, { ...module, vi: aplusSlots(module).map(() => "") }]);
    setOpenId(module.id); setPanel(null);
  };
  const useTemplate = (template: AplusTemplateId) => {
    if (modules.length && !window.confirm(copy.templates.confirmReplace)) return;
    const next = buildAplusTemplate(template, () => crypto.randomUUID()).map((m) => ({ ...m, vi: aplusSlots(m).map(() => "") }));
    setModules(next); setOpenId(next[0]?.id ?? null); setPanel(null);
  };

  async function uploadImage(key: string, file: File): Promise<string | null> {
    setUploading(key); setMessage(null);
    try {
      const prepared = await prepareImage(file);
      const body = new FormData();
      body.append("kind", "image");
      body.append("file", new File([prepared.main], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      const res = await fetch(endpoint, { method: "POST", body });
      const data = await res.json().catch(() => null) as { ok?: boolean; path?: string; message?: string } | null;
      if (!res.ok || !data?.ok || !data.path) throw new Error(data?.message || copy.errors.upload);
      return data.path;
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload });
      return null;
    } finally { setUploading(null); }
  }

  async function uploadVideo(id: string, file: File) {
    const problem = await checkVideoFile(file, copy.errors, fill);
    if (problem) { setMessage({ ok: false, text: problem }); return; }
    setUploading(id); setProgress(0); setMessage(null);
    try {
      const uid = await uploadStreamVideoAt(endpoint, file, setProgress, copy.errors.upload);
      replace(id, (m) => m.type === "video" ? { ...m, video_uid: uid } : m);
      setMessage({ ok: true, text: copy.fields.videoProcessing });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : copy.errors.upload });
    } finally { setUploading(null); setProgress(null); }
  }

  async function translate(ids: string[] = []) {
    setBusy("translate"); setMessage(null);
    const force = [...new Set([...retranslate, ...ids])];
    try {
      const result = await translateApi(modulesRef.current, force);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok && result.modules) {
        const byId = new Map(result.modules.map((m) => [m.id, m]));
        // Giữ thay đổi người dùng gõ trong lúc chờ dịch: chỉ nhận bản dịch của khối chưa đổi.
        const sent = new Map(modulesRef.current.map((m) => [m.id, JSON.stringify(m)]));
        setModules((all) => all.map((m) => sent.get(m.id) === JSON.stringify(m) ? byId.get(m.id) ?? m : m));
        setRetranslate([]);
      } else if (ids.length) setRetranslate(force);
    } catch { setMessage({ ok: false, text: copy.errors.translation }); }
    finally { setBusy(null); }
  }

  // Xem trước: khối chưa dịch hiện bản tiếng Việt kèm nhãn "Chưa dịch".
  const previewModules = modules.map((m) => aplusNeedsTranslation(m) && m.vi ? withAplusText(m, m.vi.map((value, i) => value || aplusModuleText(m)[i])) : m);
  const segment = (on: boolean) => `rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${on ? "bg-white text-brand-800 shadow-sm" : "text-ink-500 hover:text-ink-800"}`;

  return <div className="mt-5 rounded-xl border border-ink-200 bg-white" onChange={(event) => event.stopPropagation()} onInput={(event) => event.stopPropagation()}>
    {pending && <input type="hidden" name="pending_aplus_json" value={JSON.stringify(modules)} />}
    {/* Thanh trên: ngôn ngữ soạn, mức hoàn thiện, bộ mẫu, thiết bị xem trước */}
    <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-200 px-4 py-3">
      <div className="min-w-0 mr-auto">
        <p className="text-[13.5px] font-bold text-ink-900">{title} <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-800">{fill(copy.count, { count: modules.length, max: APLUS_MAX_MODULES })}</span></p>
        <p className="mt-0.5 max-w-xl text-[11.5px] leading-5 text-ink-500">{sub}</p>
      </div>
      <div role="group" aria-label={copy.lang.vi} className="inline-flex rounded-lg bg-ink-100 p-0.5">
        <button type="button" aria-pressed={mode === "vi"} onClick={() => setMode("vi")} className={segment(mode === "vi")}>{copy.lang.vi}</button>
        <button type="button" aria-pressed={mode === "en"} onClick={() => setMode("en")} className={segment(mode === "en")}>{copy.lang.en}</button>
      </div>
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50">
          {copy.meter.label}
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100"><span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(done / completeness.length) * 100}%` }} /></span>
          {done}/{completeness.length}
        </summary>
        <ul className="absolute right-0 z-30 mt-1 w-72 space-y-1.5 rounded-xl border border-ink-200 bg-white p-3 text-xs shadow-xl">
          {completeness.map((c) => <li key={c.key} className={`flex items-start gap-2 ${c.done ? "text-success" : "text-ink-600"}`}>
            <span aria-hidden="true">{c.done ? "✓" : "○"}</span>{copy.meter.criteria[c.key]}</li>)}
        </ul>
      </details>
      <button type="button" disabled={disabled} onClick={() => setPanel("templates")} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-60">
        <LayoutTemplate className="size-4" aria-hidden="true" />{copy.templates.button}</button>
      {modules.some(aplusHasVietnamese) && <button type="button" disabled={disabled} onClick={() => void translate()} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60">
        {busy === "translate" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}{busy === "translate" ? copy.translate.working : copy.translate.now}</button>}
    </div>

    {pending && <p className="mx-4 mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs leading-5 text-brand-900">{copy.savedWithProduct}</p>}
    {!editable && <p className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{copy.locked}</p>}
    <p className="mx-4 mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs leading-5 text-ink-600">{mode === "en" ? copy.lang.enHint : copy.lang.viHint}</p>

    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Trái: danh sách khối */}
      <div className="space-y-2.5 border-ink-200 bg-[#FAFBFD] p-3 sm:p-4 lg:border-r">
        {modules.map((module, index) => <BlockCard key={module.id} module={module} index={index} total={modules.length} open={openId === module.id}
          onToggle={() => setOpenId(openId === module.id ? null : module.id)} copy={copy} mode={mode} disabled={disabled}
          uploading={uploading} progress={progress} preview={preview}
          onMove={(d) => move(index, d)} onRemove={() => setModules((all) => all.filter((m) => m.id !== module.id))}
          value={(key) => slotValue(module, key)} onSlot={(key, value) => setSlot(module.id, key, value)}
          onPatch={(patch) => replace(module.id, (m) => ({ ...m, ...patch }) as AplusModule)}
          onRestructure={(fn, removed) => restructure(module.id, fn, removed)}
          onImage={async (key, file, apply) => { const path = await uploadImage(key, file); if (path) replace(module.id, (m) => apply(m, path)); }}
          onVideo={(file) => void uploadVideo(module.id, file)}
          onRetranslate={() => void translate([module.id])} translating={busy === "translate"} />)}
        {modules.length < APLUS_MAX_MODULES && <button type="button" disabled={disabled} onClick={() => setPanel("library")}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-ink-200 py-3 text-sm font-semibold text-brand-700 hover:border-brand-300 hover:bg-white disabled:opacity-60">
          <Plus className="size-4" aria-hidden="true" />{copy.add}</button>}
        <p className="text-[11px] leading-4 text-ink-500">{copy.hint}</p>
      </div>

      {/* Phải: xem trước bản tiếng Anh */}
      <div className="min-w-0 bg-ink-50 p-3 sm:p-4">
        <div className="sticky top-20">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-500">{copy.previewLabel}</span>
            <div role="group" aria-label={copy.device.label} className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-ink-200">
              {(["desktop", "mobile"] as const).map((d) => <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${device === d ? "bg-brand-700 text-white" : "text-ink-600"}`}>
                {d === "desktop" ? <Monitor className="size-3.5" aria-hidden="true" /> : <Smartphone className="size-3.5" aria-hidden="true" />}{copy.device[d]}</button>)}
            </div>
          </div>
          {/* Dựng đúng bề rộng nội dung trên trang thật (máy tính / điện thoại) rồi thu nhỏ cho vừa cột. */}
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl bg-ink-100/60 p-2 ring-1 ring-ink-200">
            <ScaledPreview key={device} width={device === "desktop" ? previewWidths.desktop + 48 : 390 + 20} label={`${copy.device[device]} · ${device === "desktop" ? previewWidths.desktop : 390} px`}
              frame={device === "mobile" ? "phone" : "page"} padding={device === "desktop" ? 24 : (390 - previewWidths.mobile) / 2}>
            {modules.length ? <ProductAplus modules={previewModules} productName="Product" imageUrl={preview}
              decorate={(module, node) => <div role="button" tabIndex={0} onClick={() => setOpenId(module.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(module.id); }}
                className={`relative cursor-pointer rounded-xl outline outline-2 outline-offset-4 transition ${openId === module.id ? "outline-brand-500" : "outline-transparent hover:outline-brand-200"}`}>
                {aplusNeedsTranslation(module) && <span className="absolute right-2 top-2 z-10 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-900 ring-1 ring-amber-200">{copy.previewPending}</span>}
                {node}
              </div>} />
              : <p className="py-16 text-center text-sm text-ink-400">{copy.templates.note}</p>}
            </ScaledPreview>
          </div>
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 px-4 py-2.5 text-xs">
      {busy === "save" && <span className="inline-flex items-center gap-1.5 text-ink-500"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{copy.saving}</span>}
      {dirty && !busy && !pending && <span className="font-semibold text-amber-800">{copy.unsaved}</span>}
      {standalone && <button type="button" disabled={disabled || !dirty} onClick={() => void saveNow()} className="btn btn-primary btn-sm ml-auto">
        {busy === "save" ? copy.saving : heading?.save ?? copy.save}</button>}
      {message && <span role={message.ok ? "status" : "alert"} className={message.ok ? "text-emerald-700" : "text-rose-700"}>{message.text}</span>}
    </div>

    {panel === "library" && <Modal title={copy.library.title} onClose={() => setPanel(null)} copy={copy}
      aside={fill(copy.library.used, { count: modules.length, max: APLUS_MAX_MODULES })}>
      {[{ label: copy.library.b2b, types: APLUS_B2B_TYPES }, { label: copy.library.basic, types: APLUS_MODULE_TYPES.filter((t) => !APLUS_B2B_TYPES.includes(t)) }].map((group) => <div key={group.label}>
        <p className="mb-2 mt-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">{group.label}</p>
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {group.types.map((type) => <button key={type} type="button" onClick={() => addModule(type)}
            className="grid content-start gap-1.5 rounded-xl border border-ink-200 p-2.5 text-left transition hover:border-brand-500 hover:shadow-sm">
            <Wireframe type={type} />
            <span className="flex items-center justify-between gap-1 text-[12.5px] font-bold text-ink-900">{copy.types[type]}
              {APLUS_B2B_TYPES.includes(type) && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{copy.newBadge}</span>}</span>
            <span className="text-[11px] leading-4 text-ink-500">{copy.typeDesc[type]}</span>
            <span className="text-[10.5px] text-ink-400">{copy.imageSize[type]}</span>
          </button>)}
        </div>
      </div>)}
    </Modal>}

    {panel === "templates" && <TemplatePicker copy={copy} ids={templateIds} onClose={() => setPanel(null)} onUse={useTemplate} />}
  </div>;
}

type BlockProps = {
  module: AplusModule; index: number; total: number; open: boolean; onToggle: () => void; copy: AplusMessages; mode: "vi" | "en";
  disabled: boolean; uploading: string | null; progress: number | null; preview: (path: string) => string;
  onMove: (direction: -1 | 1) => void; onRemove: () => void;
  value: (key: string) => string; onSlot: (key: string, value: string) => void;
  onPatch: (patch: Partial<AplusModule>) => void;
  onRestructure: (fn: (module: AplusModule) => AplusModule, removed?: { list: string; index: number }) => void;
  onImage: (key: string, file: File, apply: (module: AplusModule, path: string) => AplusModule) => Promise<void>;
  onVideo: (file: File) => void;
  onRetranslate: () => void; translating: boolean;
};

/** Một khối trong danh sách: tiêu đề thu gọn (kèm nhắc thiếu, cảnh báo liên hệ) và các ô soạn. */
function BlockCard(p: BlockProps) {
  const { module, copy, mode } = p;
  const issues = aplusBlockIssues(module);
  const texts = [...aplusModuleText(module), ...(module.vi ?? [])].join("\n");
  const contact = findContact(texts);
  const stale = aplusTranslationStale(module);
  const drift = mode === "en" ? aplusSlots(module).flatMap((slot, i) => module.vi?.[i] && slot.get(module) ? aplusNumberDrift(module.vi[i], slot.get(module)) : []) : [];
  const hintIndex = module.hint ? Number(module.hint.split(":")[1]) : -1;
  const hintTemplate = module.hint?.split(":")[0] as AplusTemplateId | undefined;
  const hint = hintTemplate && copy.templates.items[hintTemplate]?.hints[hintIndex];
  const field = "input mt-1 w-full";
  const counter = (key: string, max: number) =>
    <span className={`mt-0.5 block text-right text-[10.5px] font-normal ${p.value(key).length > max ? "font-semibold text-rose-700" : "text-ink-300"}`}>{p.value(key).length}/{max}</span>;
  const text = (key: string, label: string, max: number, options: { area?: boolean; rich?: boolean; placeholder?: string; rows?: number } = {}) => options.rich
    // Ô soạn có thanh công cụ: không bọc trong <label> (bấm vào nhãn sẽ bấm nhầm nút Đậm).
    ? <div className="block text-[11.5px] font-semibold text-ink-600"><span id={`${module.id}-${key}-label`}>{label}</span>
      <AplusRichEditor value={p.value(key)} onChange={(v) => p.onSlot(key, v)} disabled={p.disabled} rows={options.rows ?? 5} placeholder={options.placeholder}
        labelledBy={`${module.id}-${key}-label`} labels={{ bold: copy.fields.bold, italic: copy.fields.italic, bullets: copy.fields.bullets }} />
      {counter(key, max)}</div>
    : <label className="block text-[11.5px] font-semibold text-ink-600">{label}
      {options.area
        ? <textarea value={p.value(key)} rows={options.rows ?? 3} maxLength={max + 50} disabled={p.disabled} placeholder={options.placeholder} onChange={(e) => p.onSlot(key, e.target.value)} className={`${field} font-normal`} />
        : <input value={p.value(key)} maxLength={max + 50} disabled={p.disabled} placeholder={options.placeholder} onChange={(e) => p.onSlot(key, e.target.value)} className={`${field} font-normal`} />}
      {counter(key, max)}
    </label>;
  const image = (key: string, item: { image_path: string; fx?: number; fy?: number }, apply: (m: AplusModule, path: string) => AplusModule,
    focusPatch: (fx: number, fy: number) => void, altKey: string, onClear?: () => void) =>
    <ImageField src={p.preview(item.image_path)} ratio={RATIO[module.type]} fx={item.fx} fy={item.fy} busy={p.uploading === key} disabled={p.disabled} copy={copy}
      onFile={(file) => void p.onImage(key, file, apply)} onFocus={focusPatch} onClear={onClear}
      alt={text(altKey, copy.fields.alt, 160, { placeholder: copy.fields.altPlaceholder })} />;
  const itemCount = (list: string) => ((module as unknown as Record<string, unknown[]>)[list] ?? []).length;
  const range = (APLUS_ITEM_RANGE as Record<string, readonly [number, number]>)[module.type];
  const addItem = (list: string, blank: Record<string, unknown>) => p.onRestructure((m) => ({ ...m, [list]: [...((m as unknown as Record<string, unknown[]>)[list] ?? []), blank] }) as AplusModule);
  const removeItem = (list: string, i: number) => p.onRestructure((m) => ({ ...m, [list]: ((m as unknown as Record<string, unknown[]>)[list] ?? []).filter((_, j) => j !== i) }) as AplusModule, { list, index: i });
  const itemTools = (list: string, i: number) => itemCount(list) > (range?.[0] ?? 1) &&
    <button type="button" aria-label={copy.fields.removeItem} title={copy.fields.removeItem} disabled={p.disabled} onClick={() => removeItem(list, i)}
      className="rounded-md p-1 text-ink-400 hover:bg-white hover:text-rose-700"><X className="size-3.5" /></button>;
  const addButton = (list: string, blank: Record<string, unknown>) => itemCount(list) < (range?.[1] ?? 0) &&
    <button type="button" disabled={p.disabled} onClick={() => addItem(list, blank)}
      className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline"><Plus className="size-3.5" aria-hidden="true" />{copy.fields.addItem}</button>;

  return <section aria-label={copy.types[module.type]} className={`rounded-xl border bg-white transition ${p.open ? "border-brand-500 shadow-[0_0_0_3px_var(--color-brand-100)]" : contact ? "border-rose-300" : "border-ink-200"}`}>
    <div className="flex items-center gap-2 px-3 py-2.5">
      <button type="button" onClick={p.onToggle} aria-expanded={p.open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="text-[12px] font-bold text-ink-400">{p.index + 1}</span>
        <span className="truncate text-[13px] font-bold text-ink-900">{copy.types[module.type]}</span>
        {APLUS_B2B_TYPES.includes(module.type) && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{copy.newBadge}</span>}
        {contact ? <span className="truncate text-[11px] font-bold text-rose-700">{copy.contactWarn[contact]}</span>
          : issues.length > 0 ? <span className="truncate text-[11px] font-semibold text-amber-800">{copy.issues[issues[0] as keyof typeof copy.issues]}</span> : null}
      </button>
      <span className="flex items-center text-ink-400">
        <IconButton label={copy.moveUp} disabled={p.disabled || p.index === 0} onClick={() => p.onMove(-1)}><ArrowUp className="size-4" /></IconButton>
        <IconButton label={copy.moveDown} disabled={p.disabled || p.index === p.total - 1} onClick={() => p.onMove(1)}><ArrowDown className="size-4" /></IconButton>
        <IconButton label={copy.remove} disabled={p.disabled} onClick={p.onRemove}><Trash2 className="size-4" /></IconButton>
        <IconButton label={p.open ? copy.fields.collapse : copy.fields.expand} onClick={p.onToggle}>{p.open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</IconButton>
      </span>
    </div>
    {p.open && <div className="space-y-3 border-t border-ink-100 px-3 pb-3 pt-3">
      {hint && <p className="rounded-lg bg-brand-50 px-3 py-2 text-[11.5px] leading-5 text-brand-900">{hint}</p>}
      {contact && <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] font-semibold leading-5 text-rose-800"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{copy.contactWarn[contact]}</p>}
      {mode === "vi" && !aplusHasVietnamese(module) && aplusModuleText(module).some((value) => value.trim()) &&
        <p className="rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] leading-5 text-ink-600">{copy.lang.englishOnly}</p>}
      {mode === "en" && aplusHasVietnamese(module) && (stale || module.en_edited || aplusNeedsTranslation(module)) && <div className="flex flex-wrap items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] text-ink-600">
        <span className="font-semibold">{stale ? copy.translate.stale : aplusNeedsTranslation(module) ? copy.translate.pending : copy.translate.edited}</span>
        <button type="button" disabled={p.disabled} onClick={p.onRetranslate} className="ml-auto inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-60">
          {p.translating && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}{copy.translate.again}</button>
      </div>}
      {drift.length > 0 && <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-5 text-amber-900"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{fill(copy.translate.drift, { numbers: drift.join(", ") })}</p>}

      {module.type === "hero" && <>
        {image(module.id, module, (m, path) => ({ ...m, image_path: path }) as AplusModule, (fx, fy) => p.onPatch({ fx, fy } as Partial<AplusModule>), "alt")}
        {text("eyebrow", copy.fields.eyebrow, 60)}
        {text("headline", copy.fields.headline, 120, { area: true, rows: 2 })}
        {text("sub", copy.fields.subline, 240, { area: true, rows: 2 })}
      </>}

      {module.type === "highlights" && <div className="space-y-2.5">
        {module.items.map((item, i) => <div key={i} className="rounded-lg border border-ink-100 bg-ink-50/50 p-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><VeximIcon name={item.icon} size={20} /></span>
            <select aria-label={copy.fields.icon} value={item.icon} disabled={p.disabled} className="input h-8 flex-1 py-0 text-xs"
              onChange={(e) => p.onPatch({ items: module.items.map((x, j) => j === i ? { ...x, icon: e.target.value as AplusHighlightIcon } : x) } as Partial<AplusModule>)}>
              {APLUS_HIGHLIGHT_ICONS.map((icon) => <option key={icon} value={icon}>{copy.highlightIcons[icon]}</option>)}
            </select>
            {itemTools("items", i)}
          </div>
          {text(`items.${i}.title`, copy.fields.itemTitle, 60)}
          {text(`items.${i}.text`, copy.fields.itemText, 160, { area: true, rows: 2 })}
        </div>)}
        {addButton("items", { icon: "inspection", title: "", text: "" })}
      </div>}

      {module.type === "steps" && <div className="space-y-2.5">
        {module.items.map((item, i) => <div key={i} className="rounded-lg border border-ink-100 bg-ink-50/50 p-2.5">
          <div className="mb-1.5 flex items-center justify-between"><span className="text-[12px] font-bold text-ink-800">{copy.fields.stepTitle} {i + 1}</span>{itemTools("items", i)}</div>
          {text(`items.${i}.title`, copy.fields.stepTitle, 60)}
          {text(`items.${i}.text`, copy.fields.stepText, 200, { area: true, rows: 2 })}
          <p className="mt-1 text-[11.5px] font-semibold text-ink-600">{copy.fields.stepImage}</p>
          {image(`${module.id}-${i}`, item, (m, path) => m.type === "steps" ? { ...m, items: m.items.map((x, j) => j === i ? { ...x, image_path: path } : x) } : m,
            (fx, fy) => p.onPatch({ items: module.items.map((x, j) => j === i ? { ...x, fx, fy } : x) } as Partial<AplusModule>), `items.${i}.alt`,
            () => p.onPatch({ items: module.items.map((x, j) => j === i ? { ...x, image_path: "" } : x) } as Partial<AplusModule>))}
        </div>)}
        {addButton("items", { image_path: "", alt: "", title: "", text: "" })}
      </div>}

      {module.type === "packing" && <>
        {image(module.id, module, (m, path) => ({ ...m, image_path: path }) as AplusModule, (fx, fy) => p.onPatch({ fx, fy } as Partial<AplusModule>), "alt")}
        {text("title", copy.fields.packingTitle, 120)}
        <div className="space-y-1.5">
          {module.rows.map((_, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
            {text(`rows.${i}.label`, copy.fields.rowLabel, 60, { placeholder: copy.fields.rowPlaceholders[i] })}
            {text(`rows.${i}.value`, copy.fields.rowValue, 120)}
            <span className="pt-6">{itemTools("rows", i)}</span>
          </div>)}
          {addButton("rows", { label: "", value: "" })}
        </div>
      </>}

      {module.type === "faq" && <div className="space-y-2.5">
        {module.items.map((_, i) => <div key={i} className="rounded-lg border border-ink-100 bg-ink-50/50 p-2.5">
          <div className="flex items-start gap-2"><div className="flex-1">{text(`items.${i}.q`, copy.fields.question, 160)}</div>{itemTools("items", i)}</div>
          {text(`items.${i}.a`, copy.fields.answer, 600, { rich: true, rows: 3 })}
        </div>)}
        {addButton("items", { q: "", a: "" })}
      </div>}

      {module.type === "image" && <>
        {image(module.id, module, (m, path) => ({ ...m, image_path: path }) as AplusModule, (fx, fy) => p.onPatch({ fx, fy } as Partial<AplusModule>), "alt")}
        {text("caption", copy.fields.caption, 160)}
      </>}

      {module.type === "image_text" && <>
        {image(module.id, module, (m, path) => ({ ...m, image_path: path }) as AplusModule, (fx, fy) => p.onPatch({ fx, fy } as Partial<AplusModule>), "alt")}
        <div role="group" aria-label={copy.fields.imageSide} className="inline-flex rounded-lg bg-ink-100 p-0.5 text-xs">
          {(["left", "right"] as const).map((side) => <button key={side} type="button" aria-pressed={module.image_side === side} disabled={p.disabled}
            onClick={() => p.onPatch({ image_side: side } as Partial<AplusModule>)}
            className={`rounded-md px-2.5 py-1 font-semibold ${module.image_side === side ? "bg-white text-brand-800 shadow-sm" : "text-ink-500"}`}>{copy.fields[side]}</button>)}
        </div>
        {text("title", copy.fields.title, 120)}
        {text("body", copy.fields.body, 1200, { rich: true })}
      </>}

      {module.type === "gallery" && <div className="grid gap-3 sm:grid-cols-2">
        {module.items.map((item, i) => <div key={i} className="space-y-1.5">
          <div className="flex justify-end">{itemTools("items", i)}</div>
          {image(`${module.id}-${i}`, item, (m, path) => m.type === "gallery" ? { ...m, items: m.items.map((x, j) => j === i ? { ...x, image_path: path } : x) } : m,
            (fx, fy) => p.onPatch({ items: module.items.map((x, j) => j === i ? { ...x, fx, fy } : x) } as Partial<AplusModule>), `items.${i}.alt`)}
          {text(`items.${i}.caption`, copy.fields.caption, 160)}
        </div>)}
        <div className="self-center">{addButton("items", { image_path: "", alt: "", caption: "" })}</div>
      </div>}

      {module.type === "text" && <>
        {text("title", copy.fields.title, 120)}
        {text("body", copy.fields.body, 1200, { rich: true, rows: 6 })}
      </>}

      {module.type === "video" && <div className="space-y-2">
        {module.video_uid && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{copy.fields.videoProcessing}</p>}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50">
          {p.uploading === module.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Video className="size-4" aria-hidden="true" />}
          {p.uploading === module.id ? (p.progress !== null ? fill(copy.uploadingPct, { pct: p.progress }) : copy.uploading) : copy.fields.chooseVideo}
          <input type="file" accept="video/mp4,video/quicktime,video/webm" disabled={p.disabled} className="sr-only"
            onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) p.onVideo(file); }} />
        </label>
        {text("title", copy.fields.videoTitle, 120)}
      </div>}
    </div>}
  </section>;
}

/**
 * Khung xem trước đúng kích thước thật: nội dung dựng ở bề rộng `width` (như trên trang người mua)
 * rồi thu nhỏ theo tỉ lệ cho vừa cột xem trước, nên bố cục máy tính không bị ép thành bố cục hẹp.
 */
function ScaledPreview({ width, padding, frame, label, children }: { width: number; padding: number; frame: "page" | "phone"; label: string; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const measure = () => {
      const available = outer.current?.clientWidth ?? width;
      const next = Math.min(1, available / width);
      setScale(next);
      setHeight((inner.current?.offsetHeight ?? 0) * next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [width]);
  return <div ref={outer} className="w-full">
    <p className="mb-1.5 text-center text-[10.5px] text-ink-400">{label}{scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}</p>
    <div style={{ height: height || undefined }} className="relative mx-auto" >
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: "top left", padding,
        left: scale < 1 ? 0 : `calc(50% - ${width / 2}px)` }}
        className={`absolute top-0 bg-white ${frame === "phone" ? "rounded-[2rem] border-[10px] border-ink-900 shadow-lg" : "rounded-xl shadow-sm ring-1 ring-ink-200"}`}>
        {children}
      </div>
    </div>
  </div>;
}

/** Ô ảnh: khung đúng tỉ lệ hiển thị, bấm vào ảnh để chọn điểm giữa khung, mô tả ảnh ngay bên dưới. */
function ImageField({ src, ratio, fx = 50, fy = 50, busy, disabled, copy, onFile, onFocus, onClear, alt }: {
  src: string; ratio?: { css: string; label: string }; fx?: number; fy?: number; busy: boolean; disabled: boolean; copy: AplusMessages;
  onFile: (file: File) => void; onFocus: (fx: number, fy: number) => void; onClear?: () => void; alt: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="grid gap-2.5 sm:grid-cols-[minmax(0,180px)_1fr]">
    <div>
      {src
        ? <button type="button" disabled={disabled || !ratio} title={copy.fields.focusHint} aria-label={copy.fields.focus}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onFocus(Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100)); }}
          className="relative block w-full overflow-hidden rounded-lg ring-1 ring-ink-200" style={{ aspectRatio: ratio?.css ?? "16 / 10" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${fx}% ${fy}%` }} />
          {ratio && <span className="absolute left-1.5 top-1.5 rounded bg-[#0D1C36]/80 px-1.5 py-0.5 text-[10px] font-bold text-white">{ratio.label}</span>}
          {ratio && <span className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-500/70 shadow" style={{ left: `${fx}%`, top: `${fy}%` }} aria-hidden="true" />}
        </button>
        : <button type="button" disabled={disabled} onClick={() => input.current?.click()} style={{ aspectRatio: ratio?.css ?? "16 / 10" }}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-ink-300 bg-white text-[11px] font-semibold text-ink-500 hover:border-brand-500 hover:text-brand-700">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-5" aria-hidden="true" />}{busy ? copy.uploading : copy.fields.chooseImage}
        </button>}
    </div>
    <div className="space-y-1.5">
      {src && <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-60">
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ImageIcon className="size-3.5" aria-hidden="true" />}{copy.fields.replaceImage}</button>
        {onClear && <button type="button" disabled={disabled} onClick={onClear} className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-50">{copy.fields.removeImage}</button>}
      </div>}
      {ratio && <p className="text-[11px] leading-4 text-ink-400">{fill(copy.fields.ratio, { ratio: ratio.label })} {src ? copy.fields.focusHint : ""}</p>}
      {alt}
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
      onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onFile(file); }} />
  </div>;
}

function TemplatePicker({ copy, ids, onClose, onUse }: { copy: AplusMessages; ids: readonly AplusTemplateId[]; onClose: () => void; onUse: (template: AplusTemplateId) => void }) {
  const [picked, setPicked] = useState<AplusTemplateId>(ids[0]);
  const t = copy.templates.items[picked];
  return <Modal title={copy.templates.title} onClose={onClose} copy={copy}>
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div className="space-y-1.5">
        {ids.map((id) => <button key={id} type="button" onClick={() => setPicked(id)} aria-pressed={picked === id}
          className={`block w-full rounded-xl border px-3 py-2 text-left ${picked === id ? "border-brand-500 bg-white shadow-[0_0_0_3px_var(--color-brand-100)]" : "border-transparent hover:bg-ink-50"}`}>
          <span className="block text-[13px] font-bold text-ink-900">{copy.templates.items[id].name}</span>
          <span className="block text-[11.5px] text-ink-500">{fill(copy.templates.sections, { count: APLUS_TEMPLATES[id].length })} · {copy.templates.items[id].desc}</span>
        </button>)}
      </div>
      <div>
        <p className="text-xs leading-5 text-ink-500">{copy.templates.note}</p>
        <ol className="mt-3 space-y-1.5">
          {APLUS_TEMPLATES[picked].map((skeleton, i) => <li key={i} className="grid grid-cols-[24px_150px_1fr] items-center gap-2 rounded-lg border border-dashed border-ink-200 px-2.5 py-2 text-[12px]">
            <span className="flex size-6 items-center justify-center rounded-md bg-brand-50 text-[11px] font-extrabold text-brand-700">{i + 1}</span>
            <b className="text-ink-900">{copy.types[skeleton.type]}</b>
            <span className="text-ink-500">{t.hints[i]}</span>
          </li>)}
        </ol>
        <button type="button" onClick={() => onUse(picked)} className="btn btn-primary btn-sm mt-4">{copy.templates.use}</button>
      </div>
    </div>
  </Modal>;
}

function Modal({ title, aside, onClose, copy, children }: { title: string; aside?: string; onClose: () => void; copy: AplusMessages; children: ReactNode }) {
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0D1C36]/45 p-4 sm:p-8" onClick={onClose}>
    <div className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
        <p className="text-[15px] font-bold text-ink-900">{title}</p>
        <span className="flex items-center gap-3">{aside && <span className="text-xs text-ink-400">{aside}</span>}
          <button type="button" onClick={onClose} aria-label={copy.library.close} className="rounded-md p-1 text-ink-500 hover:bg-ink-50"><X className="size-4" /></button></span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>;
}

/** Minh hoạ bố cục khối trong thư viện. */
function Wireframe({ type }: { type: AplusModuleType }) {
  const box = "rounded bg-brand-100", line = "h-1.5 rounded bg-ink-200";
  const inner = (() => {
    switch (type) {
      case "hero": return <div className="flex h-full flex-col justify-end gap-1 rounded bg-brand-300 p-2"><span className="h-1.5 w-3/5 rounded bg-white" /><span className="h-1.5 w-2/5 rounded bg-white/80" /></div>;
      case "highlights": return <div className="grid h-full grid-cols-4 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={box} />)}</div>;
      case "steps": return <div className="grid h-full grid-cols-5 gap-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={i % 2 ? box : "rounded bg-brand-300"} />)}</div>;
      case "packing": return <div className="grid h-full grid-cols-2 gap-1.5"><span className={box} /><span className="flex flex-col justify-center gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={line} />)}</span></div>;
      case "faq": return <div className="flex h-full flex-col justify-center gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`${line} ${i % 2 ? "w-1/2 bg-ink-100" : "w-4/5"}`} />)}</div>;
      case "image": return <span className={`block h-full ${box}`} />;
      case "image_text": return <div className="grid h-full grid-cols-2 gap-1.5"><span className={box} /><span className="flex flex-col justify-center gap-1"><span className={line} /><span className={`${line} w-3/4`} /></span></div>;
      case "gallery": return <div className="grid h-full grid-cols-3 gap-1">{[0, 1, 2].map((i) => <span key={i} className={box} />)}</div>;
      case "text": return <div className="flex h-full flex-col justify-center gap-1"><span className="h-2 w-1/2 rounded bg-brand-300" /><span className={line} /><span className={line} /><span className={`${line} w-3/5`} /></div>;
      case "video": return <div className="flex h-full items-center justify-center rounded bg-brand-300 text-white">▶</div>;
    }
  })();
  return <div className="aspect-[16/10] rounded-lg border border-ink-100 bg-ink-50 p-1.5" aria-hidden="true">{inner}</div>;
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
    className="rounded-md p-1.5 text-ink-500 hover:bg-ink-50 hover:text-ink-900 disabled:opacity-40">{children}</button>;
}
