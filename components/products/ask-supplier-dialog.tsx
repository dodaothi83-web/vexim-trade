"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { lockDialogScroll } from "@/lib/browser/dialog-scroll-lock";
import { useBuyerEnquiryAuth } from "@/components/buyer-enquiry-auth";

/** Câu hỏi hay gặp; bấm là chèn vào ô nhập, người mua sửa tiếp được. */
const QUICK_QUESTIONS = [
  "What is your best price for one container?",
  "What is the minimum order quantity?",
  "What is the lead time after the order is confirmed?",
  "Can you send samples?",
  "Which certificates do you have for this product?",
];

export function AskSupplierDialog({ category, productId, productName, supplierId, supplierName, grade, imageUrl, quoteHref }: {
  category: string; productId: string; productName: string; supplierId: string;
  supplierName: string; grade: string; imageUrl: string | null; quoteHref: string;
}) {
  const { email, requireBuyer } = useBuyerEnquiryAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function showQuestion() { setError(null); dialog.current?.showModal(); }
  async function start() {
    const body = message.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/chat/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, body }) }).catch(() => null);
    setBusy(false);
    if (res?.status === 401) { requireBuyer(window.location.pathname + "?ask=1", showQuestion); return; }
    if (!res?.ok) {
      setError(res?.status === 429 ? "You are sending too many messages. Please wait a few minutes." : res?.status === 400 ? "This product cannot receive messages right now." : "Message not sent. Please try again.");
      return;
    }
    const { id } = await res.json() as { id: string };
    router.push(`/buyer/account/messages?c=${encodeURIComponent(id)}`);
  }
  function open() {
    const destination = new URL(window.location.href);
    destination.searchParams.set("ask", "1");
    requireBuyer(destination.pathname + destination.search, showQuestion);
  }
  useEffect(() => {
    if (params.get("ask") === "1") {
      open();
    }
  }, [params, email]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    let unlock: (() => void) | null = null;
    const sync = () => {
      if (element.open && !unlock) unlock = lockDialogScroll();
      else if (!element.open && unlock) { unlock(); unlock = null; }
    };
    const observer = new MutationObserver(sync);
    sync();
    observer.observe(element, { attributes: true, attributeFilter: ["open"] });
    return () => { observer.disconnect(); unlock?.(); };
  }, []);
  return <>
    <button type="button" onClick={open} aria-label={`Ask supplier about ${productName}`} className="btn btn-soft min-h-12 w-full justify-center px-2 text-sm font-bold sm:px-4 sm:text-base">
      <MessageCircle className="h-5 w-5 shrink-0" />Ask supplier
    </button>
    <dialog ref={dialog} aria-labelledby="ask-supplier-title" className="fixed inset-0 m-auto h-[100dvh] max-h-[100dvh] w-screen max-w-none overflow-y-auto bg-white p-5 text-ink-900 backdrop:bg-black/40 sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-2xl sm:p-8"
      onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close(); } }}>
      <div className="flex items-start justify-between gap-4">
        <h2 id="ask-supplier-title" className="text-2xl font-bold">Ask the supplier</h2>
        <button autoFocus type="button" aria-label="Close" className="rounded-lg p-2 hover:bg-ink-50" onClick={() => dialog.current?.close()}><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-1 text-sm text-ink-600">Chat directly with {supplierName}. Replies arrive in your Vexim messages and by email.</p>
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3">
        {imageUrl ? <img src={imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="h-14 w-14 shrink-0 rounded-lg bg-ink-100" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{productName}</p>
          <p className="truncate text-xs text-ink-500">{supplierName}{grade ? ` · ${grade}` : ""}</p>
        </div>
      </div>
      <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void start(); }}>
        <div className="flex flex-wrap gap-1.5">{QUICK_QUESTIONS.map((q) => <button key={q} type="button" onClick={() => setMessage((m) => m.trim() ? `${m.trim()}\n${q}` : q)}
          className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:border-brand-300 hover:text-brand-800">{q}</button>)}</div>
        <label htmlFor="ask-supplier-message" className="mt-4 block text-sm font-semibold text-ink-800">Your message</label>
        <textarea id="ask-supplier-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000}
          placeholder="Ask about price, specifications, packaging, MOQ or samples…" className="input mt-1.5 text-[15px] leading-6" />
        {error && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">Your email address is not shared with the supplier.</p>
          <button type="submit" disabled={!message.trim() || busy} className="btn btn-primary min-h-11 px-5 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send message
          </button>
        </div>
      </form>
    </dialog>
  </>;
}
