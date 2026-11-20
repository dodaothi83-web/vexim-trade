"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2, Video } from "lucide-react";

import { showcaseHasContact } from "@/lib/supplier-showcase";
import { looksVietnamese } from "@/lib/vietnamese-text";

/**
 * Các thành phần sửa trực tiếp trên bản xem trước của "Thiết kế trang" (kiểu Notion): chữ gõ
 * thẳng tại chỗ với đúng kiểu chữ của trang thật, ảnh và video có nút phủ lên. Chỉ dùng trong
 * trình thiết kế; trang công khai không dùng các thành phần này.
 */

export type InlineCopy = {
  placeholder: string;
  tooLong: string;
  language: string;
  contact: string;
  change: string;
  remove: string;
  add: string;
  uploading: string;
  replaceVideo: string;
  addVideo: string;
};

/**
 * Ô chữ sửa tại chỗ: không viền, cùng kiểu chữ với trang; rê chuột thấy viền nét đứt, bấm là gõ.
 * Cảnh báo (quá dài, tiếng Việt, thông tin liên hệ) hiện ngay dưới ô; máy chủ vẫn kiểm tra khi lưu.
 */
export function InlineText({ value, onChange, placeholder, max, className = "", multiline = false, tone = "light", copy, label }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  max: number;
  className?: string;
  multiline?: boolean;
  /** Chữ trên nền tối (banner) dùng viền và chữ cảnh báo sáng. */
  tone?: "light" | "dark";
  copy: InlineCopy;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const problem = value.length > max ? copy.tooLong.replace("{max}", String(max))
    : value.trim() && showcaseHasContact(value) ? copy.contact
      : value.trim() && looksVietnamese(value) ? copy.language : "";
  const dark = tone === "dark";
  return <span className="block" onClick={(event) => event.stopPropagation()}>
    <textarea ref={ref} value={value} rows={1} aria-label={label} placeholder={placeholder} spellCheck
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onKeyDown={(event) => { if (!multiline && event.key === "Enter") { event.preventDefault(); (event.target as HTMLTextAreaElement).blur(); } }}
      onChange={(event) => onChange(multiline ? event.target.value : event.target.value.replace(/\n/g, " "))}
      className={`block w-full resize-none overflow-hidden rounded-md border-0 bg-transparent p-0 outline-dashed outline-1 outline-offset-4 transition focus:outline-2 focus:outline-solid ${dark
        ? "outline-transparent placeholder:text-white/50 hover:outline-white/60 focus:outline-white"
        : "outline-transparent placeholder:text-ink-300 hover:outline-brand-300 focus:outline-brand-600"} ${className}`} />
    {(focused || problem) && <span className={`mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] font-semibold ${dark ? "text-white/85" : ""}`}>
      <span className={value.length > max ? "text-rose-500" : dark ? "" : "text-ink-400"}>{value.length}/{max}</span>
      {problem && <span className={dark ? "rounded bg-rose-600 px-1.5 py-0.5 text-white" : "text-rose-600"}>{problem}</span>}
    </span>}
  </span>;
}

/** Nút nhỏ nổi trên ảnh, video. */
export function OverlayButton({ onClick, children, danger = false, disabled = false, label }: {
  onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean; label: string;
}) {
  return <button type="button" aria-label={label} title={label} disabled={disabled}
    onClick={(event) => { event.stopPropagation(); onClick(); }}
    className={`inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[11.5px] font-semibold shadow-md ring-1 ring-black/5 transition hover:bg-white disabled:opacity-60 ${danger ? "text-rose-700" : "text-ink-800"}`}>
    {children}
  </button>;
}

/** Chọn tệp ảnh rồi gọi upload; dùng chung cho các nút Đổi/Thêm ảnh. */
export function useImagePicker(upload: (file: File) => Promise<void>) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const picker = <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" tabIndex={-1}
    onClick={(event) => event.stopPropagation()}
    onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (!file) return;
      setBusy(true);
      try { await upload(file); } finally { setBusy(false); }
    }} />;
  return { open: () => input.current?.click(), busy, picker };
}

/** Lớp nút phủ lên một ảnh: Đổi ảnh, Xóa ảnh. */
export function ImageOverlay({ onReplace, onRemove, copy, className = "right-2 top-2" }: {
  onReplace: (file: File) => Promise<void>; onRemove?: () => void; copy: InlineCopy; className?: string;
}) {
  const { open, busy, picker } = useImagePicker(onReplace);
  return <span className={`absolute z-10 flex gap-1.5 transition @2xl:opacity-0 @2xl:group-hover/img:opacity-100 ${className}`}>
    <OverlayButton label={copy.change} onClick={open} disabled={busy}>
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3.5" aria-hidden="true" />}{busy ? copy.uploading : copy.change}
    </OverlayButton>
    {onRemove && <OverlayButton label={copy.remove} onClick={onRemove} danger disabled={busy}><Trash2 className="size-3.5" aria-hidden="true" />{copy.remove}</OverlayButton>}
    {picker}
  </span>;
}

/** Ô trống "+ Thêm ảnh" đặt ngay chỗ ảnh sẽ hiện. */
export function AddImageTile({ onAdd, copy, className = "" }: { onAdd: (file: File) => Promise<void>; copy: InlineCopy; className?: string }) {
  const { open, busy, picker } = useImagePicker(onAdd);
  return <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); open(); }}
    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-ink-300 bg-white/70 text-xs font-semibold text-ink-500 transition hover:border-brand-500 hover:text-brand-700 disabled:opacity-60 ${className}`}>
    {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-5" aria-hidden="true" />}{busy ? copy.uploading : copy.add}
    {picker}
  </button>;
}

/** Nút tải, thay video ngay trên khối (kèm phần trăm khi đang tải). */
export function VideoPicker({ hasVideo, onUpload, onRemove, copy }: {
  hasVideo: boolean;
  onUpload: (file: File, onProgress: (pct: number) => void) => Promise<void>;
  onRemove?: () => void;
  copy: InlineCopy;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  return <span className="flex flex-wrap gap-1.5">
    <OverlayButton label={hasVideo ? copy.replaceVideo : copy.addVideo} disabled={progress !== null} onClick={() => input.current?.click()}>
      {progress !== null ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Video className="size-3.5" aria-hidden="true" />}
      {progress !== null ? `${copy.uploading} ${progress}%` : hasVideo ? copy.replaceVideo : copy.addVideo}
    </OverlayButton>
    {hasVideo && onRemove && <OverlayButton label={copy.remove} danger onClick={onRemove} disabled={progress !== null}><Trash2 className="size-3.5" aria-hidden="true" />{copy.remove}</OverlayButton>}
    <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        setProgress(0);
        try { await onUpload(file, setProgress); } finally { setProgress(null); }
      }} />
  </span>;
}
