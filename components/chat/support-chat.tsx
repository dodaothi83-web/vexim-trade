"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { VeximPlatformSupportIcon } from "@/components/brand/vexim-icons";
import { cx } from "@/components/ui";
import { DeliveryTicks, PRESENCE_LABELS, PresenceLine, deliveryStatus } from "@/components/chat/presence";

interface SupportMessageView { id: string; mine: boolean; body: string; author: string | null; createdAt: string; pending?: boolean }

const POLL_MS = 6_000;
const MAX = 4000;

const COPY = {
  en: {
    title: "Vexim Trade team", sub: "Questions about sourcing, verification or your account.",
    greeting: "Hi! How can we help you source from Vietnam? Our team replies here and by email.",
    topics: ["Help me find a supplier", "How does supplier verification work?", "I have a question about my request", "I have a problem with my account"],
    placeholder: "Type your message…", send: "Send", close: "Close", enter: "Enter to send, Shift + Enter for a new line.",
    failed: "Message not sent. Please try again.", rateLimited: "You are sending too fast. Wait a few minutes and try again.",
    tooLong: "The message is too long (maximum 4,000 characters).", loadError: "Could not load messages. Close and open the chat again.",
    you: "You",
  },
  vi: {
    title: "Đội ngũ Vexim Trade", sub: "Hỏi về tìm nguồn hàng, xác minh hoặc tài khoản của bạn.",
    greeting: "Xin chào! Vexim có thể giúp gì cho bạn? Đội ngũ trả lời ngay tại đây và qua email.",
    topics: ["Tìm giúp tôi nhà cung cấp", "Vexim xác minh nhà cung cấp thế nào?", "Tôi muốn hỏi về yêu cầu đã gửi", "Tài khoản của tôi gặp vấn đề"],
    placeholder: "Nhập tin nhắn…", send: "Gửi", close: "Đóng", enter: "Enter để gửi, Shift + Enter để xuống dòng.",
    failed: "Chưa gửi được tin. Hãy thử lại.", rateLimited: "Bạn đang gửi quá nhanh. Đợi vài phút rồi thử lại.",
    tooLong: "Tin nhắn quá dài (tối đa 4.000 ký tự).", loadError: "Chưa tải được tin nhắn. Đóng và mở lại khung chat.",
    you: "Bạn",
  },
};

function time(iso: string, locale: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(locale, sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

/**
 * Khung chat người mua ↔ đội Vexim, nổi ở góc phải và không chặn trang phía sau, để người mua
 * vừa xem sản phẩm vừa hỏi. Tin của nhân viên hiện kèm tên gọi; email nội bộ không lộ ra.
 */
export function SupportChat({ isVi = false, onClose }: { isVi?: boolean; onClose: () => void }) {
  const t = COPY[isVi ? "vi" : "en"];
  const locale = isVi ? "vi-VN" : "en-GB";
  const [messages, setMessages] = useState<SupportMessageView[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [staffReadAt, setStaffReadAt] = useState<string | null>(null);
  const [staffLastSeen, setStaffLastSeen] = useState<string | null>(null);
  const presence = PRESENCE_LABELS[isVi ? "vi" : "en"];
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/support", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) { setMessages((m) => m ?? []); setError((e) => e ?? t.loadError); return; }
    const data = await res.json() as { messages: SupportMessageView[]; staffReadAt?: string | null; staffLastSeen?: string | null };
    setStaffReadAt(data.staffReadAt ?? null); setStaffLastSeen(data.staffLastSeen ?? null);
    setMessages((current) => [...data.messages, ...(current ?? []).filter((m) => m.pending)]);
  }, [t.loadError]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => { window.clearInterval(timer); window.removeEventListener("keydown", onKey); };
  }, [load, onClose]);

  useEffect(() => {
    const n = messages?.length ?? 0;
    if (n !== count.current) endRef.current?.scrollIntoView({ block: "end" });
    count.current = n;
  }, [messages]);

  async function send(text = draft) {
    const body = text.trim();
    if (!body || sending) return;
    if (body.length > MAX) { setError(t.tooLong); return; }
    setSending(true); setError(null);
    const temp: SupportMessageView = { id: `tmp-${Date.now()}`, mine: true, body, author: null, createdAt: new Date().toISOString(), pending: true };
    setMessages((m) => [...(m ?? []), temp]);
    setDraft("");
    const res = await fetch("/api/support", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, pagePath: window.location.pathname + window.location.search }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      setMessages((m) => (m ?? []).filter((x) => x.id !== temp.id));
      setDraft(body);
      setError(res?.status === 429 ? t.rateLimited : t.failed);
      return;
    }
    const data = await res.json() as { message: SupportMessageView };
    setMessages((m) => (m ?? []).map((x) => x.id === temp.id ? data.message : x));
  }

  return <section role="dialog" aria-modal="false" aria-labelledby="vexim-support-title" lang={isVi ? "vi" : "en"}
    className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:bottom-6 sm:right-20 sm:h-[min(600px,calc(100dvh-7rem))] sm:w-[380px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-ink-200 sm:shadow-2xl sm:shadow-brand-900/20 lg:right-24">
    <header className="flex items-center gap-3 bg-brand-700 px-4 py-3.5 text-white">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15"><VeximPlatformSupportIcon size={24} strokeWidth={2.2} /></span>
      <div className="min-w-0 flex-1">
        <h2 id="vexim-support-title" className="truncate text-[15px] font-bold">{t.title}</h2>
        <p className="truncate text-[12px]">{staffLastSeen ? <PresenceLine lastSeen={staffLastSeen} labels={presence} locale={locale} dark /> : <span className="text-brand-100">{t.sub}</span>}</p>
      </div>
      <button type="button" onClick={onClose} aria-label={t.close} className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
    </header>

    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-ink-50/60 px-4 py-4" aria-live="polite">
      <div className="flex flex-col items-start">
        <span className="mb-0.5 px-1 text-[11px] font-semibold text-ink-500">Vexim Trade</span>
        <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-[14px] leading-6 text-ink-900 shadow-sm ring-1 ring-ink-100">{t.greeting}</div>
      </div>
      {messages === null ? <p className="flex justify-center py-6 text-ink-400"><Loader2 className="h-5 w-5 animate-spin" /></p> : <>
        {messages.map((m, i, all) => <div key={m.id} className={cx("flex flex-col", m.mine ? "items-end" : "items-start")}>
          {!m.mine && m.author && <span className="mb-0.5 px-1 text-[11px] font-semibold text-ink-500">{m.author}</span>}
          <div className={cx("max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-6 shadow-sm",
            m.mine ? "rounded-br-md bg-brand-700 text-white" : "rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-100", m.pending && "opacity-70")}>{m.body}</div>
          <span className="mt-0.5 flex items-center gap-1 px-1 text-[10.5px] text-ink-400">
            {time(m.createdAt, locale)}
            {m.mine && <DeliveryTicks status={deliveryStatus(m, staffReadAt)} labels={presence} showText={!all.slice(i + 1).some((x) => x.mine)} />}
          </span>
        </div>)}
        {messages.length === 0 && <div className="flex flex-wrap gap-1.5 pt-1">{t.topics.map((topic) => <button key={topic} type="button" onClick={() => void send(topic)}
          className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-left text-[12.5px] font-medium text-brand-800 shadow-sm transition hover:border-brand-400 hover:bg-brand-50">{topic}</button>)}</div>}
      </>}
      <div ref={endRef} />
    </div>

    <form className="border-t border-ink-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      {error && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-[12.5px] text-red-800">{error}</p>}
      <div className="flex items-end gap-2">
        <textarea id="vexim-support-message" ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={MAX} placeholder={t.placeholder} aria-label={t.placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
          className="input min-h-[44px] flex-1 resize-none text-[14px] leading-6" />
        <button type="submit" disabled={!draft.trim() || sending} aria-label={t.send} className="btn btn-primary h-11 shrink-0 px-3.5 disabled:opacity-60">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink-400">{t.enter}</p>
    </form>
  </section>;
}
