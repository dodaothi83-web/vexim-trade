"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, Send } from "lucide-react";

type State = { error: "unavailable" | "empty" | "too_long" | "rate_limited" | "unknown" | null; body: string };
const INITIAL: State = { error: null, body: "" };

export interface RfqChatLabels {
  title: string;
  body: string;
  open: string;
  send: string;
  sending: string;
  placeholder: string;
  closed: string;
  error: Record<Exclude<State["error"], null>, string>;
}

/**
 * Trao đổi về một RFQ trực tiếp, phía nhà cung cấp: không còn khung riêng theo RFQ, mọi tin đi
 * vào Tin nhắn. Đã có cuộc với người mua này thì mở cuộc đó; chưa có thì gửi câu hỏi đầu tiên
 * ngay tại đây, gửi xong chuyển sang Tin nhắn.
 */
export function RfqChatStart({ matchId, conversationHref, canStart, labels, action }: {
  matchId: string;
  /** Cuộc trò chuyện sẵn có giữa nhà cung cấp và người mua này. */
  conversationHref: string | null;
  canStart: boolean;
  labels: RfqChatLabels;
  action: (previous: State, fd: FormData) => Promise<State>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  return <section aria-labelledby="rfq-chat-title" data-testid="rfq-chat" className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span>
      <div className="min-w-0">
        <h2 id="rfq-chat-title" className="text-[16px] font-bold text-ink-900">{labels.title}</h2>
        <p className="mt-1 text-[13px] leading-5 text-ink-600">{labels.body}</p>
      </div>
    </div>
    {conversationHref ? <Link href={conversationHref} prefetch={false} className="btn btn-primary mt-4 min-h-11">
      <MessageCircle className="h-4 w-4" aria-hidden="true" />{labels.open}<ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link> : canStart ? <form action={formAction} className="mt-4">
      <input type="hidden" name="match_id" value={matchId} />
      <label htmlFor={`rfq-chat-${matchId}`} className="sr-only">{labels.placeholder}</label>
      <textarea id={`rfq-chat-${matchId}`} name="body" required maxLength={4000} rows={3} defaultValue={state.body} key={state.body}
        placeholder={labels.placeholder} className="input min-h-[88px] w-full resize-y text-[14px] leading-6" />
      {state.error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800">{labels.error[state.error]}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary mt-3 min-h-11"><Send className="h-4 w-4" aria-hidden="true" />{pending ? labels.sending : labels.send}</button>
    </form> : <p className="mt-4 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-[13px] text-ink-600">{labels.closed}</p>}
  </section>;
}
