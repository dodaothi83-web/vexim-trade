"use client";

import { useActionState } from "react";
import { RfqReadTracker } from "@/components/rfq-thread";
import { MessageCircle, Send } from "lucide-react";
import type { SafeMediatedMessage, MediatedError } from "@/lib/rfq/mediated";

type State = { error: MediatedError | "unknown" | null; body: string; sent: boolean; seq: number };
const INITIAL: State = { error: null, body: "", sent: false, seq: 0 };

/** Only the two members of this desk receive these messages. Staff never relays
 * one side's raw chat to the other; quote snapshots are published separately.
 */
export function RfqMediatedThread({ rfqId, matchId = null, side, messages, lastVisibleAt, canPost, locale,
  sendAction, markRead }: {
  rfqId: string; matchId?: string | null; side: "buyer" | "supplier" | "staff";
  messages: SafeMediatedMessage[]; lastVisibleAt: string | null; canPost: boolean; locale: "en" | "vi";
  sendAction: (previous: State, fd: FormData) => Promise<State>; markRead: (at: string) => Promise<void>;
}) {
  const [state, action, pending] = useActionState(sendAction, INITIAL);
  const vi = locale === "vi";
  const party = matchId ? (vi ? "Nhà cung cấp" : "Supplier") : (vi ? "Người mua" : "Buyer");
  const title = side === "staff" ? `${vi ? "Trao đổi với" : "Conversation with"} ${party}`
    : vi ? "Trao đổi với Vexim" : "Discuss with Vexim";
  const id = side === "staff" ? `desk-${matchId ?? "buyer"}` : "vexim-conversation";
  const date = (iso: string) => new Intl.DateTimeFormat(vi ? "vi-VN" : "en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(iso));
  const shown = messages.slice(-200);
  const earlier = messages.slice(0, -200);
  const render = (m: SafeMediatedMessage) => {
    const mine = m.sender === side;
    const name = mine ? vi ? "Bạn" : "You" : m.sender === "staff" ? "Vexim" : party;
    return <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[92%] rounded-2xl border px-4 py-3 sm:max-w-[80%] ${mine ? "border-brand-100 bg-brand-50/70" : "border-ink-200 bg-ink-50"}`}>
        <p className="text-[11px] text-ink-500"><strong className="text-ink-900">{name}</strong> · <time dateTime={m.created_at}>{date(m.created_at)}</time></p>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-6 text-ink-900">{m.body}</p>
      </div>
    </li>;
  };
  const errors = vi ? {
    unavailable: "Yêu cầu hoặc mạch trao đổi đã đóng. Tải lại trang.", empty: "Hãy viết nội dung trước khi gửi.",
    too_long: "Tin nhắn tối đa 2.000 ký tự.", rate_limited: "Bạn gửi quá nhiều tin. Vui lòng thử lại sau.",
    contact: "Không chia sẻ email, số điện thoại hoặc website người mua trong mạch này.",
    unknown: "Chưa lưu được tin nhắn. Vui lòng thử lại.",
  } : {
    unavailable: "This request or conversation has closed. Please refresh.", empty: "Write a message first.",
    too_long: "Keep the message under 2,000 characters.", rate_limited: "Too many messages. Please try again later.",
    contact: "Do not share buyer email, phone number or website in the supplier conversation.",
    unknown: "Could not save your message. Please try again.",
  };
  return <section id={id} aria-label={title} className="scroll-mt-24 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
    <header className="flex items-start gap-3 border-b border-ink-100 px-5 py-5 sm:px-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span>
      <div><h2 className="font-bold text-ink-900">{title}</h2><p className="mt-1 text-[13px] leading-5 text-ink-600">
        {side === "staff" ? (vi ? "Chỉ Vexim và bên này thấy mạch trao đổi." : "Only Vexim and this participant see this thread.")
          : (vi ? "Chỉ bạn và Vexim thấy tin nhắn này; bên còn lại không đọc được." : "Only you and Vexim see these messages; the other party cannot read them.")}
      </p></div>
    </header>
    <div className="px-5 py-5 sm:px-6">
      {!shown.length ? <p className="rounded-xl border border-dashed border-ink-200 bg-ink-50 p-5 text-center text-[13px] text-ink-600">{vi ? "Chưa có tin nhắn. Hãy hỏi về yêu cầu hoặc báo giá tại đây." : "No messages yet. Ask about the request or quote here."}</p> : <>
        {!!earlier.length && <details className="mb-5 rounded-xl border border-ink-200 px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold text-brand-700">{vi ? "Tin nhắn cũ" : "Earlier messages"} ({earlier.length})</summary><ol className="mt-4 space-y-4">{earlier.map(render)}</ol></details>}
        <ol className="space-y-4">{shown.map(render)}</ol>
        <RfqReadTracker at={lastVisibleAt} markRead={markRead} />
      </>}
      {canPost ? <form key={`${state.seq}:${state.body}`} action={action} className="mt-6 border-t border-ink-100 pt-5">
        <input type="hidden" name="rfq_id" value={rfqId} /><input type="hidden" name="match_id" value={matchId ?? ""} />
        <label htmlFor={`mediation-${side}-${matchId ?? rfqId}`} className="block text-[13px] font-bold text-ink-800">{vi ? "Tin nhắn" : "Message"}</label>
        <textarea id={`mediation-${side}-${matchId ?? rfqId}`} name="body" rows={3} maxLength={2000} required defaultValue={state.body}
          placeholder={vi ? "Hỏi thêm về quy cách, báo giá hoặc bước tiếp theo…" : "Ask about specifications, a quote or the next step…"}
          className="input mt-2 w-full resize-y rounded-xl bg-white text-sm leading-6" />
        <div className="mt-3 flex items-center justify-between gap-3"><p className="text-[12px] leading-5 text-ink-500">{vi ? "Tin nhắn được lưu trong RFQ. Email chỉ để thông báo." : "Messages are saved in the RFQ. Email is for notifications only."}</p>
          <button type="submit" disabled={pending} className="btn btn-primary min-h-11"><Send className="h-4 w-4" aria-hidden="true" />{pending ? (vi ? "Đang lưu…" : "Saving…") : (vi ? "Gửi tin nhắn" : "Send message")}</button></div>
        {state.error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800">{errors[state.error]}</p>}
        {state.sent && !state.error && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800">{vi ? "Đã gửi tin nhắn." : "Message sent."}</p>}
      </form> : <p className="mt-5 rounded-lg bg-ink-50 p-3 text-[13px] text-ink-600">{vi ? "Mạch trao đổi đang ở chế độ chỉ đọc." : "This conversation is read-only."}</p>}
    </div>
  </section>;
}
