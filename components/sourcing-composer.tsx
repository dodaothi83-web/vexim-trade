"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2, Paperclip, Send, X } from "lucide-react";
import { lockDialogScroll } from "@/lib/browser/dialog-scroll-lock";
import { useBuyerEnquiryAuth } from "@/components/buyer-enquiry-auth";
import { FormChallenge } from "@/components/form-challenge";
import { SOURCING_MAX_FILES, SOURCING_MAX_FILE_BYTES } from "@/lib/sourcing/files";

export function SourcingComposerTrigger({ isVi = false, renderTrigger }: {
  isVi?: boolean;
  /** Nút mở khác (ví dụ thanh công cụ nổi); mặc định là nút trên đầu trang. */
  renderTrigger?: (props: { onClick: () => void; ref: Ref<HTMLButtonElement> }) => ReactNode;
}) {
  const { requireBuyer } = useBuyerEnquiryAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(""); const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [sentId, setSentId] = useState(""); const [key, setKey] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null); const [attempt, setAttempt] = useState(0);
  const label = isVi ? "Yêu cầu tìm nguồn" : "Sourcing request";
  const vi = isVi;
  useEffect(() => {
    if (!open) return;
    const node = dialog.current; node?.showModal();
    const unlock = lockDialogScroll();
    return () => { node?.close(); unlock(); };
  }, [open]);
  function close() { if (!busy) { setOpen(false); trigger.current?.focus(); } }
  function begin() {
    const next = window.location.pathname + window.location.search;
    requireBuyer(next, () => { setSentId(""); if (!key) setKey(crypto.randomUUID()); setOpen(true); });
  }
  function attach(incoming: FileList | null) {
    if (!incoming) return;
    const selected = Array.from(incoming);
    if (files.length + selected.length > SOURCING_MAX_FILES || selected.some((f) => f.size > SOURCING_MAX_FILE_BYTES || !/\.(pdf|jpe?g|png|webp)$/i.test(f.name))) {
      setError(vi ? "Tối đa 3 tệp PDF, JPG, PNG hoặc WEBP; mỗi tệp không quá 2 MB." : "Up to 3 PDF, JPG, PNG or WEBP files; 2 MB per file.");
    } else { setFiles([...files, ...selected]); setError(""); }
    if (input.current) input.current.value = "";
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || !challenge || content.trim().length < 1) return;
    setBusy(true); setError("");
    const fd = new FormData(); fd.set("content", content.trim()); fd.set("submission_key", key); fd.set("challengeToken", challenge);
    files.forEach((file) => fd.append("files", file));
    try {
      const response = await fetch("/api/buyer/sourcing", { method: "POST", body: fd, headers: { "Accept-Language": vi ? "vi" : "en" } });
      const data = await response.json();
      if (response.status === 401) {
        setBusy(false); setOpen(false);
        requireBuyer(window.location.pathname + window.location.search, () => setOpen(true), true);
        setError(vi ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : "Your session expired. Please sign in again.");
        return;
      }
      if (!response.ok || typeof data.id !== "string") throw new Error(data.error || (vi ? "Chưa gửi được. Vui lòng thử lại." : "Could not send. Please retry."));
      setSentId(data.id); setContent(""); setFiles([]); setKey(crypto.randomUUID());
      setOpen(false); trigger.current?.focus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : (vi ? "Mất kết nối. Nội dung vẫn được giữ." : "Connection lost. Your draft is kept.")); }
    finally { setBusy(false); setChallenge(null); setAttempt((n) => n + 1); }
  }
  return <>
    {renderTrigger ? renderTrigger({ onClick: begin, ref: trigger }) : <button ref={trigger} type="button" onClick={begin} aria-haspopup="dialog" aria-label={label} lang={vi ? "vi" : "en"} className="group/cta inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-brand-700 px-3.5 text-[12px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(31,62,116,0.7)] transition hover:-translate-y-px hover:bg-brand-800 hover:shadow-[0_10px_22px_-10px_rgba(31,62,116,0.8)] focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:px-5 sm:text-[14px]">
      <span className="xl:hidden">{vi ? "Tìm nguồn" : "Sourcing"}</span><span className="hidden xl:inline">{label}</span><ArrowRight className="hidden h-3.5 w-3.5 transition-transform group-hover/cta:translate-x-0.5 xl:block" aria-hidden />
    </button>}
    {open && <dialog ref={dialog} aria-labelledby="sourcing-title" onCancel={(e) => {
      // A file input also fires `cancel` when its native picker is dismissed.
      // React propagates that event to this handler; it is not a dialog dismissal.
      if (e.target !== e.currentTarget) return;
      e.preventDefault(); close();
    }} className="fixed inset-auto bottom-0 right-0 m-0 max-h-[94dvh] w-full max-w-none overflow-hidden rounded-t-2xl border border-ink-200 bg-white p-0 text-ink-900 shadow-2xl backdrop:bg-ink-950/30 sm:bottom-5 sm:right-5 sm:w-[min(680px,calc(100vw-40px))] sm:rounded-2xl" lang={vi ? "vi" : "en"}>
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4 sm:px-7"><div><h2 id="sourcing-title" className="text-lg font-bold">{label}</h2><p className="mt-0.5 text-xs text-ink-500">Vexim Trade</p></div><button type="button" disabled={busy} onClick={close} aria-label={vi ? "Đóng" : "Close"} className="rounded-lg p-2 text-ink-500 hover:bg-ink-50 disabled:opacity-40"><X className="h-5 w-5" /></button></div>
      <form onSubmit={submit} aria-busy={busy}>
        <div className="max-h-[calc(94dvh-185px)] overflow-y-auto px-5 pt-5 sm:px-7 sm:pt-6">
          <label htmlFor="sourcing-content" className="mb-3 block text-sm font-semibold">{vi ? "Bạn đang cần tìm nguồn hàng gì?" : "What would you like us to source?"}</label>
          <textarea id="sourcing-content" autoFocus required minLength={1} maxLength={6000} disabled={busy} value={content} onChange={(e) => setContent(e.target.value)} placeholder={vi ? "Mô tả sản phẩm bạn cần, số lượng, tiêu chuẩn, nơi giao hàng và thời gian dự kiến…" : "Tell us about the product, quantity, specifications, delivery destination and timeline…"} className="min-h-[230px] w-full resize-y rounded-xl border border-ink-200 bg-white p-4 text-[15px] leading-7 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:min-h-[280px]" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500"><span>{vi ? "Gửi riêng cho đội ngũ Vexim, không gửi tới nhà cung cấp." : "Sent privately to Vexim, not to suppliers."}</span><span>{content.length.toLocaleString(vi ? "vi" : "en")}/{(6000).toLocaleString(vi ? "vi" : "en")}</span></div>
          {!!files.length && <ul className="mt-4 space-y-2">{files.map((f, i) => <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm"><Paperclip className="h-4 w-4 shrink-0 text-ink-400" /><span className="min-w-0 flex-1 truncate">{f.name}</span><button type="button" disabled={busy} onClick={() => setFiles(files.filter((_, j) => i !== j))} aria-label={`${vi ? "Xóa" : "Remove"} ${f.name}`} className="p-1"><X className="h-4 w-4" /></button></li>)}</ul>}
          <FormChallenge key={attempt} purpose="sourcing-request" onChange={setChallenge} messages={vi ? undefined : { loading: "Security check", success: "Verified", error: "Security check failed", retry: "Retry" }} />
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 bg-ink-50/50 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
          <div><input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" className="sr-only" tabIndex={-1} onChange={(e) => attach(e.target.files)} /><button type="button" onClick={() => input.current?.click()} disabled={busy || files.length >= SOURCING_MAX_FILES} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 disabled:opacity-40"><Paperclip className="h-4 w-4" />{vi ? "Đính kèm tệp" : "Attach files"}</button><p className="mt-1 text-[11px] text-ink-500">{vi ? "Tối đa 3 tệp · 2 MB/tệp" : "Up to 3 files · 2 MB each"}</p></div>
          <button type="submit" disabled={busy || !challenge || content.trim().length < 1} className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{busy ? (vi ? "Đang gửi…" : "Sending…") : (vi ? "Gửi yêu cầu" : "Send request")}</button>
        </div>
      </form>
    </dialog>}
    {sentId && !open && <div role="status" lang={vi ? "vi" : "en"} className="fixed bottom-5 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-emerald-200 bg-white p-4 text-ink-900 shadow-xl sm:right-5">
      <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
      <div><p className="text-sm font-semibold">{vi ? "Đã gửi yêu cầu tìm nguồn." : "Sourcing request sent."}</p><Link href={`/buyer/account/sourcing/${sentId}${vi ? "?lang=vi" : ""}`} className="mt-1 inline-block text-sm font-semibold text-brand-700 underline">{vi ? "Xem yêu cầu" : "View request"}</Link></div>
      <button type="button" onClick={() => setSentId("")} aria-label={vi ? "Ẩn thông báo" : "Dismiss notification"} className="rounded-md p-1 text-ink-500 hover:bg-ink-50"><X className="h-4 w-4" /></button>
    </div>}
  </>;
}
