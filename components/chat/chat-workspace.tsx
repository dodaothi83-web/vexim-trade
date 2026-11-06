"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MessageCircle, Package, Send } from "lucide-react";
import { cx } from "@/components/ui";

export interface ChatLabels {
  title: string;
  empty: string;
  emptyHint: string;
  pick: string;
  placeholder: string;
  send: string;
  back: string;
  about: string;
  unread: string;
  failed: string;
  rateLimited: string;
  tooLong: string;
  loadError: string;
  enterHint: string;
  notice: string;
}

interface ConversationView { id: string; counterpart: string; counterpartHref: string | null; productName: string | null; preview: string | null; lastMessageAt: string | null; unread: boolean }
interface MessageView { id: string; mine: boolean; body: string; productName: string | null; createdAt: string; pending?: boolean }

const LIST_POLL_MS = 15_000;
const THREAD_POLL_MS = 6_000;
const MAX = 4000;

function shortTime(iso: string | null, locale: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(locale, sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }).format(d);
}

function fullTime(iso: string, locale: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d) : "";
}

/**
 * Khung chat hai cột: danh sách cuộc trò chuyện bên trái, nội dung bên phải. Trên điện thoại
 * chỉ hiện một cột. Tin mới được hỏi lại máy chủ định kỳ khi tab đang mở, không cần kết nối
 * thời gian thực. Enter để gửi, Shift+Enter để xuống dòng.
 */
export function ChatWorkspace({ side, labels, locale, initialId = null }: { side: "buyer" | "supplier"; labels: ChatLabels; locale: string; initialId?: string | null }) {
  const [list, setList] = useState<ConversationView[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [thread, setThread] = useState<{ conversation: ConversationView; messages: MessageView[] } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/chat?side=${side}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) { if (list === null) setList([]); return; }
    const data = await res.json() as { conversations: ConversationView[] };
    setList(data.conversations);
    setActiveId((current) => current ?? (window.matchMedia("(min-width: 768px)").matches ? data.conversations[0]?.id ?? null : null));
  }, [side, list]);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/chat/${encodeURIComponent(id)}?side=${side}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) { setError(labels.loadError); return; }
    const data = await res.json() as { conversation: ConversationView; messages: MessageView[] };
    setThread(data);
    setList((rows) => rows?.map((r) => r.id === id ? { ...r, unread: false } : r) ?? rows);
  }, [side, labels.loadError]);

  useEffect(() => { void loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void loadList(); };
    const timer = window.setInterval(tick, LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadList]);
  useEffect(() => {
    if (!activeId) { setThread(null); return; }
    setError(null);
    void loadThread(activeId);
    const url = new URL(window.location.href);
    url.searchParams.set("c", activeId);
    window.history.replaceState(null, "", url);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadThread(activeId); }, THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, loadThread]);
  useEffect(() => {
    const count = thread?.messages.length ?? 0;
    if (count !== lastCount.current) endRef.current?.scrollIntoView({ block: "end" });
    lastCount.current = count;
  }, [thread]);

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    if (body.length > MAX) { setError(labels.tooLong); return; }
    setSending(true); setError(null);
    const temp: MessageView = { id: `tmp-${Date.now()}`, mine: true, body, productName: null, createdAt: new Date().toISOString(), pending: true };
    setThread((t) => t ? { ...t, messages: [...t.messages, temp] } : t);
    setDraft("");
    const res = await fetch(`/api/chat/${encodeURIComponent(activeId)}?side=${side}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      setThread((t) => t ? { ...t, messages: t.messages.filter((m) => m.id !== temp.id) } : t);
      setDraft(body);
      setError(res?.status === 429 ? labels.rateLimited : labels.failed);
      return;
    }
    const data = await res.json() as { message: MessageView };
    setThread((t) => t ? { ...t, messages: t.messages.map((m) => m.id === temp.id ? data.message : m) } : t);
    setList((rows) => rows ? [{ ...rows.find((r) => r.id === activeId)!, preview: body, lastMessageAt: data.message.createdAt }, ...rows.filter((r) => r.id !== activeId)] : rows);
  }

  const active = useMemo(() => list?.find((c) => c.id === activeId) ?? null, [list, activeId]);

  return <div className="flex h-[calc(100dvh-11rem)] min-h-[480px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
    {/* Danh sách cuộc trò chuyện */}
    <aside className={cx("w-full shrink-0 flex-col border-r border-ink-100 md:flex md:w-80", activeId ? "hidden" : "flex")}>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3.5">
        <MessageCircle className="h-5 w-5 text-brand-700" aria-hidden="true" />
        <h2 className="text-[15px] font-bold text-ink-900">{labels.title}</h2>
        {list && list.some((c) => c.unread) && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{list.filter((c) => c.unread).length}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list === null ? <p className="flex items-center gap-2 p-4 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /></p>
          : list.length === 0 ? <div className="p-6 text-center"><p className="text-sm font-semibold text-ink-800">{labels.empty}</p><p className="mt-1 text-xs leading-5 text-ink-500">{labels.emptyHint}</p></div>
          : <ul>{list.map((c) => <li key={c.id}>
            <button type="button" onClick={() => setActiveId(c.id)} aria-current={c.id === activeId ? "true" : undefined}
              className={cx("flex w-full items-start gap-3 border-b border-ink-50 px-4 py-3 text-left transition", c.id === activeId ? "bg-brand-50" : "hover:bg-ink-50")}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{c.counterpart.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cx("truncate text-[13.5px]", c.unread ? "font-bold text-ink-900" : "font-semibold text-ink-800")}>{c.counterpart}</span>
                  <span className="shrink-0 text-[11px] text-ink-400">{shortTime(c.lastMessageAt, locale)}</span>
                </span>
                {c.productName && <span className="block truncate text-[11.5px] text-ink-500">{c.productName}</span>}
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cx("min-w-0 flex-1 truncate text-[12.5px]", c.unread ? "font-semibold text-ink-800" : "text-ink-500")}>{c.preview}</span>
                  {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-label={labels.unread} />}
                </span>
              </span>
            </button>
          </li>)}</ul>}
      </div>
    </aside>

    {/* Nội dung cuộc trò chuyện */}
    <section className={cx("min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>
      {!activeId || !thread ? <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-ink-500">
        {activeId ? <Loader2 className="h-5 w-5 animate-spin" /> : labels.pick}
      </div> : <>
        <header className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
          <button type="button" onClick={() => setActiveId(null)} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:hidden" aria-label={labels.back}><ArrowLeft className="h-5 w-5" /></button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{thread.conversation.counterpart.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            {thread.conversation.counterpartHref
              ? <Link href={thread.conversation.counterpartHref} className="block truncate text-[14.5px] font-bold text-ink-900 hover:underline">{thread.conversation.counterpart}</Link>
              : <p className="truncate text-[14.5px] font-bold text-ink-900">{thread.conversation.counterpart}</p>}
            {active?.productName && <p className="flex items-center gap-1 truncate text-[12px] text-ink-500"><Package className="h-3.5 w-3.5" aria-hidden="true" />{active.productName}</p>}
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-ink-50/60 px-4 py-4">
          <p className="mx-auto max-w-md rounded-lg bg-white px-3 py-2 text-center text-[11.5px] leading-4 text-ink-500 shadow-sm">{labels.notice}</p>
          {thread.messages.map((m, i) => {
            const showProduct = m.productName && m.productName !== thread.messages[i - 1]?.productName;
            return <div key={m.id} className={cx("flex flex-col", m.mine ? "items-end" : "items-start")}>
              {showProduct && <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-600 ring-1 ring-ink-200"><Package className="h-3 w-3" aria-hidden="true" />{labels.about} {m.productName}</span>}
              <div title={fullTime(m.createdAt, locale)} className={cx("max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-6 shadow-sm",
                m.mine ? "rounded-br-md bg-brand-700 text-white" : "rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-100", m.pending && "opacity-70")}>{m.body}</div>
              <span className="mt-0.5 px-1 text-[10.5px] text-ink-400">{shortTime(m.createdAt, locale)}</span>
            </div>;
          })}
          <div ref={endRef} />
        </div>
        <form className="border-t border-ink-100 p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          {error && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-[12.5px] text-red-800">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={MAX} placeholder={labels.placeholder}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
              className="input min-h-[44px] flex-1 resize-none text-[14px] leading-6" aria-label={labels.placeholder} />
            <button type="submit" disabled={!draft.trim() || sending} className="btn btn-primary h-11 shrink-0 px-4 disabled:opacity-60">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="hidden sm:inline">{labels.send}</span>
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-400">{labels.enterHint}</p>
        </form>
      </>}
    </section>
  </div>;
}
