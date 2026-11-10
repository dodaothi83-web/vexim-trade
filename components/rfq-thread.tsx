"use client";

import { useActionState, useEffect, useRef } from "react";
import { MessageCircle, Send } from "lucide-react";
import type { RfqThreadMessage } from "@/lib/types";
import type { RfqThreadError } from "@/lib/rfq/portal-conversation";
import type { RfqPortalCopy } from "@/lib/rfq/portal-copy";

type State = { error: RfqThreadError | "unknown" | null; body: string; sent: boolean; seq: number };
type SafeMessage = Pick<RfqThreadMessage, "id" | "sender" | "body" | "created_at">;
const INITIAL: State = { error: null, body: "", sent: false, seq: 0 };

/** Mark only the timestamp shown on this page, never later unseen messages. */
export function RfqReadTracker({ at, markRead }: { at: string | null; markRead: (at: string) => Promise<void> }) {
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!at || marked.current === at) return;
    marked.current = at;
    void markRead(at).catch(() => { marked.current = null; });
  }, [at, markRead]);
  return null;
}

/** Scoped RFQ conversation, not the general product chat; no participant emails on the client. */
export function RfqThread({ rfqId, matchId, side, messages, lastVisibleAt, canPost, copy, locale, sendAction, markRead }: {
  rfqId: string; matchId: string; side: "buyer" | "supplier";
  messages: SafeMessage[]; lastVisibleAt: string | null; canPost: boolean;
  copy: RfqPortalCopy; locale: "en" | "vi";
  sendAction: (previous: State, fd: FormData) => Promise<State>;
  markRead: (at: string) => Promise<void>;
}) {
  const [state, action, pending] = useActionState(sendAction, INITIAL);
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
  const shown = messages.slice(-200);
  const earlier = messages.slice(0, -200);
  const renderMessage = (message: SafeMessage) => {
    const mine = message.sender === side;
    return <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[92%] rounded-2xl border px-4 py-3 sm:max-w-[80%] ${mine ? "border-brand-100 bg-brand-50/70" : "border-ink-200 bg-ink-50"}`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
          <span className={`font-bold ${mine ? "text-brand-800" : "text-ink-800"}`}>{mine ? (locale === "vi" ? "Bạn" : "You") :
            message.sender === "buyer" ? (locale === "vi" ? "Người mua" : "Buyer") : (locale === "vi" ? "Nhà cung cấp" : "Supplier")}</span>
          <time dateTime={message.created_at} className="text-ink-500">{date(message.created_at)}</time>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-6 text-ink-900">{message.body}</p>
      </div>
    </li>;
  };
  return <section id="rfq-conversation" aria-labelledby="rfq-conversation-title" className="scroll-mt-24 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
    <RfqReadTracker at={lastVisibleAt} markRead={markRead} />
    <header className="flex items-start gap-3 border-b border-ink-100 px-5 py-5 sm:px-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span>
      <div>
        <h2 id="rfq-conversation-title" className="text-[16px] font-bold text-ink-900">{copy.conversation}</h2>
        <p className="mt-1 text-[13px] leading-5 text-ink-600">{side === "buyer" ? copy.privateThread : copy.supplierThread}</p>
      </div>
    </header>
    <div className="px-5 py-5 sm:px-6">
      {!shown.length ? <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-center text-[13px] leading-6 text-ink-600">{copy.emptyThread}</p>
        : <>
          {earlier.length > 0 && <details className="mb-5 rounded-xl border border-ink-200 px-4 py-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-brand-700">{copy.earlierMessages} ({earlier.length})</summary>
            <ol aria-label={copy.earlierMessages} className="mt-4 space-y-4 border-t border-ink-100 pt-4">{earlier.map(renderMessage)}</ol>
          </details>}
          <ol aria-label={copy.conversation} className="space-y-4">{shown.map(renderMessage)}</ol>
        </>}
      {canPost ? <form key={`${state.seq}:${state.body}`} action={action} className="mt-6 border-t border-ink-100 pt-5">
        <input type="hidden" name="rfq_id" value={rfqId} /><input type="hidden" name="match_id" value={matchId} />
        <label htmlFor={`rfq-reply-${matchId}`} className="block text-[13px] font-bold text-ink-800">{copy.send}</label>
        <textarea id={`rfq-reply-${matchId}`} name="body" rows={3} required maxLength={2000} defaultValue={state.body}
          placeholder={side === "buyer" ? copy.placeholder : copy.supplierPlaceholder}
          className="input mt-2 w-full resize-y rounded-xl bg-white text-sm leading-6" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-[12px] leading-5 text-ink-500">{copy.contactInfo}</p>
          <button type="submit" disabled={pending} className="btn btn-primary min-h-11"><Send className="h-4 w-4" aria-hidden="true" />{pending ? copy.sending : copy.send}</button>
        </div>
        {state.error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800">{copy.error[state.error]}</p>}
        {state.sent && !state.error && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800">{copy.sent}</p>}
      </form> : <p className="mt-5 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-[13px] text-ink-600">{copy.closed}</p>}
    </div>
  </section>;
}
