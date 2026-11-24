"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, FileX, Loader2, RotateCcw, X } from "lucide-react";
import { cx } from "@/components/ui";
import { compressImage } from "@/lib/media/client-image";
import {
  CHAT_FILES_PER_MESSAGE, CHAT_FILE_MAX_BYTES, checkChatFile, cleanFileName, formatChatFileSize, type ChatFileKind,
} from "@/lib/chat/attachments-core";
import type { ChatFileLabels } from "@/lib/chat/attachment-labels";

export { CHAT_FILE_LABELS, chatFileLabels, type ChatFileLabels } from "@/lib/chat/attachment-labels";

/**
 * Tệp đính kèm trong khung chat: chọn tệp là tải lên ngay (thanh tiến độ, nút thử lại), nên bấm
 * Gửi là đi liền. Ảnh được nén trên trình duyệt (cạnh dài 1600px, bỏ EXIF) trước khi tải. Tệp đi
 * thẳng lên kho bằng link có chữ ký do máy chủ cấp, không qua máy chủ Vexim.
 */

/** Tệp đã gửi, như máy chủ trả về (lib/chat/attachments.ts › ChatAttachmentView). */
export interface ChatFileView { id: string; name: string; size: number; kind: ChatFileKind; expired: boolean; url: string | null; previewUrl?: string | null }

export interface DraftFile {
  localId: string;
  name: string;
  size: number;
  kind: ChatFileKind;
  blob: Blob;
  previewUrl: string | null;
  status: "preparing" | "uploading" | "ready" | "error";
  progress: number;
  error: string | null;
  /** Lỗi tải lên do mạng hoặc máy chủ: hiện nút Thử lại. Lỗi do tệp (loại, dung lượng…) thì không. */
  retryable: boolean;
  attachmentId: string | null;
}

type ErrorCode = keyof ChatFileLabels["errors"];

class UploadError extends Error { constructor(public code: ErrorCode) { super(code); } }

const isImage = (kind: ChatFileKind) => kind === "image";

async function sha256Hex(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new UploadError("failed");
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** PUT có thanh tiến độ (fetch chưa báo tiến độ tải lên). Trả mã HTTP, 0 khi lỗi mạng/CORS. */
function putWithProgress(url: string, blob: Blob, headers: Record<string, string>, onProgress: (ratio: number) => void): Promise<number> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.onabort = () => resolve(0);
    xhr.send(blob);
  });
}

function errorFromCode(code: unknown): ErrorCode {
  if (code === "type" || code === "name") return "type";
  if (code === "size" || code === "too_large") return "size";
  if (code === "quota") return "quota";
  if (code === "content") return "content";
  if (code === "rate_limited") return "rate";
  return "failed";
}

/** Ảnh: nén trên trình duyệt (bỏ EXIF). Ảnh nén lớn hơn bản gốc PNG/WebP thì giữ bản gốc. */
async function prepare(file: File): Promise<{ blob: Blob; name: string }> {
  const name = cleanFileName(file.name);
  const check = checkChatFile({ name, size: Math.max(1, file.size) });
  if (!check.ok && check.error !== "size") throw new UploadError(errorFromCode(check.error));
  if (check.ok ? check.kind !== "image" : !/\.(jpe?g|png|webp)$/i.test(name)) {
    if (file.size > CHAT_FILE_MAX_BYTES) throw new UploadError("size");
    return { blob: file, name };
  }
  try {
    const compressed = await compressImage(file);
    const isJpeg = /\.jpe?g$/i.test(name);
    if (isJpeg || compressed.size < file.size) return { blob: compressed, name: name.replace(/\.(jpe?g|png|webp)$/i, ".jpg") };
  } catch { /* trình duyệt không đọc được ảnh: gửi bản gốc nếu vừa dung lượng */ }
  if (file.size > CHAT_FILE_MAX_BYTES) throw new UploadError("size");
  return { blob: file, name };
}

/** Hàng tệp của tin đang soạn trong một cuộc trò chuyện. */
export function useChatUploads(conversationId: string | null, side: "buyer" | "supplier", labels: ChatFileLabels) {
  const [drafts, setDrafts] = useState<DraftFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const draftsRef = useRef(drafts);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  const conversationRef = useRef(conversationId);

  const patch = useCallback((localId: string, change: Partial<DraftFile>) => {
    setDrafts((list) => list.map((d) => d.localId === localId ? { ...d, ...change } : d));
  }, []);

  const base = useCallback((cid: string) => `/api/chat/${encodeURIComponent(cid)}/attachments`, []);

  const discardRemote = useCallback((cid: string | null, attachmentId: string | null) => {
    if (!cid || !attachmentId) return;
    void fetch(`${base(cid)}/${encodeURIComponent(attachmentId)}?side=${side}`, { method: "DELETE" }).catch(() => null);
  }, [base, side]);

  const upload = useCallback(async (draft: DraftFile) => {
    const cid = conversationRef.current;
    if (!cid) return;
    patch(draft.localId, { status: "uploading", progress: 0, error: null });
    try {
      const sha256 = await sha256Hex(draft.blob);
      const begin = await fetch(`${base(cid)}?side=${side}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, size: draft.blob.size, sha256 }),
      }).catch(() => null);
      if (!begin) throw new UploadError("failed");
      const ticket = await begin.json().catch(() => ({})) as {
        error?: string; attachment?: { id: string }; fallbackUrl?: string | null;
        upload?: { url: string; headers: Record<string, string>; direct: boolean } | null;
      };
      if (!begin.ok || !ticket.attachment) throw new UploadError(errorFromCode(ticket.error));
      const attachmentId = ticket.attachment.id;
      if (conversationRef.current !== cid) { discardRemote(cid, attachmentId); return; }
      patch(draft.localId, { attachmentId });
      if (ticket.upload) {
        const onProgress = (ratio: number) => patch(draft.localId, { progress: Math.min(0.97, ratio) });
        let status = await putWithProgress(ticket.upload.url, draft.blob, ticket.upload.headers, onProgress);
        // Kho chưa mở CORS cho tên miền này (hoặc mạng chặn): tệp nhỏ thì tải qua máy chủ.
        if ((status < 200 || status >= 300) && ticket.fallbackUrl) status = await putWithProgress(ticket.fallbackUrl, draft.blob, ticket.upload.headers, onProgress);
        if (status < 200 || status >= 300) {
          discardRemote(cid, attachmentId);
          throw new UploadError(status === 400 ? "content" : "failed");
        }
        const finish = await fetch(`${base(cid)}/${encodeURIComponent(attachmentId)}?side=${side}`, { method: "POST" }).catch(() => null);
        if (!finish?.ok) {
          const data = await finish?.json().catch(() => ({})) as { error?: string } | undefined;
          throw new UploadError(errorFromCode(data?.error));
        }
      }
      patch(draft.localId, { status: "ready", progress: 1 });
    } catch (error) {
      const code = error instanceof UploadError ? error.code : "failed";
      patch(draft.localId, { status: "error", attachmentId: null, error: labels.errors[code], retryable: code === "failed" || code === "rate" });
    }
  }, [base, discardRemote, labels.errors, patch, side]);

  // Đổi cuộc: bỏ các tệp đang soạn của cuộc trước (tệp đã tải được dọn trên máy chủ).
  useEffect(() => {
    const previous = conversationRef.current;
    conversationRef.current = conversationId;
    if (previous === conversationId) return;
    for (const d of draftsRef.current) {
      if (d.status === "ready") discardRemote(previous, d.attachmentId);
      if (d.previewUrl) URL.revokeObjectURL(d.previewUrl);
    }
    setDrafts([]);
    setNotice(null);
  }, [conversationId, discardRemote]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const picked = Array.from(files);
    if (!picked.length) return;
    setNotice(null);
    const room = CHAT_FILES_PER_MESSAGE - draftsRef.current.length;
    if (picked.length > room) setNotice(labels.errors.count);
    for (const file of picked.slice(0, Math.max(0, room))) {
      const localId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const initial = checkChatFile({ name: file.name, size: Math.max(1, file.size) });
      const kind: ChatFileKind = initial.ok ? initial.kind : "doc";
      const placeholder: DraftFile = { localId, name: cleanFileName(file.name) || file.name, size: file.size, kind, blob: file, previewUrl: null, status: "preparing", progress: 0, error: null, retryable: false, attachmentId: null };
      setDrafts((list) => [...list, placeholder]);
      draftsRef.current = [...draftsRef.current, placeholder];
      try {
        const ready = await prepare(file);
        const draft: DraftFile = { ...placeholder, name: ready.name, size: ready.blob.size, blob: ready.blob, previewUrl: isImage(kind) ? URL.createObjectURL(ready.blob) : null };
        patch(localId, draft);
        void upload(draft);
      } catch (error) {
        patch(localId, { status: "error", error: labels.errors[error instanceof UploadError ? error.code : "failed"], retryable: false });
      }
    }
  }, [labels.errors, patch, upload]);

  const retry = useCallback((localId: string) => {
    const draft = draftsRef.current.find((d) => d.localId === localId);
    if (!draft || draft.status !== "error" || !draft.retryable || draft.blob.size > CHAT_FILE_MAX_BYTES) return;
    if (!checkChatFile({ name: draft.name, size: draft.blob.size }).ok) return;
    void upload(draft);
  }, [upload]);

  const remove = useCallback((localId: string) => {
    const draft = draftsRef.current.find((d) => d.localId === localId);
    if (!draft) return;
    discardRemote(conversationRef.current, draft.attachmentId);
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setDrafts((list) => list.filter((d) => d.localId !== localId));
    setNotice(null);
  }, [discardRemote]);

  /** Lấy các tệp đã sẵn sàng để gửi kèm tin; bỏ khỏi khung soạn (gửi lỗi thì `restore`). */
  const take = useCallback(() => {
    const ready = draftsRef.current.filter((d) => d.status === "ready" && d.attachmentId);
    setDrafts((list) => list.filter((d) => !ready.includes(d)));
    draftsRef.current = draftsRef.current.filter((d) => !ready.includes(d));
    return ready;
  }, []);
  const restore = useCallback((files: DraftFile[]) => {
    setDrafts((list) => [...files, ...list].slice(0, CHAT_FILES_PER_MESSAGE));
  }, []);

  const busy = drafts.some((d) => d.status === "preparing" || d.status === "uploading");
  const readyCount = drafts.filter((d) => d.status === "ready").length;
  return { drafts, notice, setNotice, addFiles, retry, remove, take, restore, busy, readyCount };
}

function KindIcon({ kind, className }: { kind: ChatFileKind; className?: string }) {
  const Icon = kind === "sheet" || kind === "csv" ? FileSpreadsheet : FileText;
  const tone = kind === "pdf" ? "text-rose-600" : kind === "sheet" || kind === "csv" ? "text-emerald-700" : kind === "doc" ? "text-blue-700" : "text-ink-500";
  return <Icon className={cx("shrink-0", tone, className)} aria-hidden="true" />;
}

/** Các tệp trong khung soạn tin: ảnh xem trước, thanh tiến độ, thử lại, bỏ tệp. */
export function ComposerFiles({ drafts, labels, locale, onRetry, onRemove }: {
  drafts: DraftFile[]; labels: ChatFileLabels; locale: string; onRetry: (id: string) => void; onRemove: (id: string) => void;
}) {
  if (!drafts.length) return null;
  return <ul className="mb-2 flex flex-wrap gap-2" data-testid="chat-composer-files">
    {drafts.map((d) => <li key={d.localId} className={cx("relative flex w-[calc(50%-4px)] items-center gap-2 overflow-hidden rounded-xl border bg-white p-1.5 pr-7 shadow-sm sm:w-[236px] sm:gap-2.5 sm:p-2 sm:pr-8",
      d.status === "error" ? "border-red-200 bg-red-50/60" : "border-ink-200")}>
      {d.previewUrl
        ? <img src={d.previewUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-ink-100 sm:h-10 sm:w-10" />
        : <span className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-ink-50">{d.status === "error" ? <FileX className="h-5 w-5 text-red-500" aria-hidden="true" /> : <KindIcon kind={d.kind} className="h-5 w-5" />}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-ink-900" title={d.name}>{d.name}</span>
        {d.status === "error"
          ? <span className="block text-[11px] leading-4 text-red-700">
            <span className="block" title={d.error ?? undefined}>{d.error}</span>
            {d.retryable && <button type="button" onClick={() => onRetry(d.localId)} className="mt-0.5 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"><RotateCcw className="h-3 w-3" aria-hidden="true" />{labels.retry}</button>}
          </span>
          : d.status === "ready"
            ? <span className="block text-[11px] text-ink-500">{formatChatFileSize(d.size, locale)}</span>
            : <span className="mt-1 block">
              <span className="sr-only">{labels.uploading}</span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(d.progress * 100)}>
                <span className="block h-full rounded-full bg-brand-600 transition-[width] duration-200" style={{ width: `${Math.max(6, Math.round(d.progress * 100))}%` }} />
              </span>
            </span>}
      </span>
      {(d.status === "preparing" || d.status === "uploading") && <Loader2 className="absolute right-8 top-2 h-3.5 w-3.5 animate-spin text-ink-400" aria-hidden="true" />}
      <button type="button" onClick={() => onRemove(d.localId)} aria-label={labels.remove} title={labels.remove}
        className="absolute right-1 top-1 rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X className="h-3.5 w-3.5" /></button>
    </li>)}
  </ul>;
}

function downloadUrl(url: string) {
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

/** Tệp trong một tin: ảnh hiện ô xem trước, tệp khác là một dòng tên + dung lượng + tải về. */
export function MessageFiles({ files, mine, labels, locale, onMediaLoad }: {
  files: ChatFileView[]; mine: boolean; labels: ChatFileLabels; locale: string;
  /** Ảnh tải xong làm khung tin cao thêm: khung chat cuộn lại xuống cuối nếu người đọc đang ở cuối. */
  onMediaLoad?: () => void;
}) {
  if (!files.length) return null;
  const images = files.filter((f) => f.kind === "image" && !f.expired && (f.url || f.previewUrl));
  const others = files.filter((f) => !images.includes(f));
  return <div className={cx("mb-1 flex max-w-[80%] flex-col gap-1.5", mine ? "items-end" : "items-start")} data-testid="chat-message-files">
    {images.length > 0 && <div className={cx("flex flex-wrap gap-1.5", mine ? "justify-end" : "justify-start")}>
      {images.map((f) => {
        const src = f.previewUrl ?? f.url!;
        const img = <img src={src} alt={f.name} loading="lazy" onLoad={onMediaLoad} className={cx("rounded-xl object-cover ring-1 ring-ink-100", images.length === 1 ? "max-h-60 max-w-[260px]" : "h-28 w-28")} />;
        return f.url ? <a key={f.id} href={f.url} target="_blank" rel="noopener" title={f.name} className="block overflow-hidden rounded-xl bg-white shadow-sm">{img}</a>
          : <span key={f.id} className="block overflow-hidden rounded-xl bg-white opacity-80 shadow-sm">{img}</span>;
      })}
    </div>}
    {others.map((f) => f.expired
      ? <div key={f.id} className="flex w-[260px] max-w-full items-center gap-2.5 rounded-xl border border-dashed border-ink-200 bg-white/70 px-3 py-2 text-ink-500">
        <FileX className="h-5 w-5 shrink-0 text-ink-400" aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-medium line-through decoration-ink-300">{f.name}</span><span className="block text-[11px]">{labels.expired}</span></span>
      </div>
      : <div key={f.id} className="flex w-[260px] max-w-full items-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-2 shadow-sm">
        <KindIcon kind={f.kind} className="h-6 w-6" />
        <span className="min-w-0 flex-1">
          {f.url
            ? <a href={f.kind === "pdf" ? f.url : downloadUrl(f.url)} target={f.kind === "pdf" ? "_blank" : undefined} rel="noopener" title={f.name} className="block truncate text-[12.5px] font-semibold text-ink-900 hover:text-brand-800 hover:underline">{f.name}</a>
            : <span className="block truncate text-[12.5px] font-semibold text-ink-900">{f.name}</span>}
          <span className="block text-[11px] text-ink-500">{formatChatFileSize(f.size, locale)}</span>
        </span>
        {f.url && <a href={downloadUrl(f.url)} aria-label={`${labels.download} ${f.name}`} title={labels.download} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-brand-800"><Download className="h-4 w-4" /></a>}
      </div>)}
  </div>;
}
