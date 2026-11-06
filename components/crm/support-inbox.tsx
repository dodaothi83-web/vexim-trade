"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Headset, Loader2, Send, UserCheck, UserMinus } from "lucide-react";
import { cx } from "@/components/ui";
import { DeliveryTicks, PRESENCE_LABELS, PresenceDot, PresenceLine, deliveryStatus } from "@/components/chat/presence";

const presence = PRESENCE_LABELS.vi;

interface ConversationView {
  id: string; buyerEmail: string; buyerLabel: string; buyerCompany: string | null; buyerCrmId: string | null;
  assignedTo: string | null; assignedName: string | null; preview: string | null; lastMessageAt: string | null;
  lastSender: "buyer" | "staff" | null; unread: boolean; buyerReadAt: string | null; buyerLastSeen: string | null;
}
interface MessageView { id: string; mine: boolean; body: string; author: string | null; pagePath: string | null; createdAt: string; pending?: boolean }
type Tab = "waiting" | "mine" | "unassigned" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "waiting", label: "Chờ trả lời" },
  { key: "mine", label: "Của tôi" },
  { key: "unassigned", label: "Chưa ai nhận" },
  { key: "all", label: "Tất cả" },
];
const LIST_POLL_MS = 15_000;
const THREAD_POLL_MS = 6_000;

function when(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat("vi-VN", sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

/**
 * Hộp chat của đội Vexim với người mua. Nhân viên có quyền trả lời thì trả lời và nhận xử lý;
 * trả lời một cuộc chưa ai nhận là tự nhận cuộc đó. Người chỉ có quyền xem thấy nội dung nhưng
 * không có ô nhập.
 */
export function SupportInbox({ initialId = null }: { initialId?: string | null }) {
  const [list, setList] = useState<ConversationView[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("waiting");
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [thread, setThread] = useState<{ conversation: ConversationView; messages: MessageView[]; canReply: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/crm/support", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) { setList((l) => l ?? []); return; }
    const data = await res.json() as { conversations: ConversationView[]; me: string };
    setList(data.conversations); setMe(data.me);
  }, []);
  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/crm/support/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) { setError("Chưa tải được cuộc trò chuyện. Tải lại trang để thử lại."); return; }
    const data = await res.json() as { conversation: ConversationView; messages: MessageView[]; canReply: boolean };
    setThread((t) => ({ ...data, messages: [...data.messages, ...(t?.conversation.id === id ? t.messages.filter((m) => m.pending) : [])] }));
    setList((rows) => rows?.map((r) => r.id === id ? { ...r, unread: false } : r) ?? rows);
  }, []);

  useEffect(() => {
    void loadList();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadList(); }, LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadList]);
  useEffect(() => {
    if (!activeId) { setThread(null); return; }
    setError(null); setThread(null);
    void loadThread(activeId);
    const url = new URL(window.location.href); url.searchParams.set("c", activeId); window.history.replaceState(null, "", url);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadThread(activeId); }, THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, loadThread]);
  useEffect(() => {
    const n = thread?.messages.length ?? 0;
    if (n !== count.current) endRef.current?.scrollIntoView({ block: "end" });
    count.current = n;
  }, [thread]);

  const rows = useMemo(() => (list ?? []).filter((c) =>
    tab === "all" ? true : tab === "mine" ? c.assignedTo === me : tab === "unassigned" ? !c.assignedTo : c.lastSender === "buyer"), [list, tab, me]);
  const counts = useMemo(() => ({
    waiting: (list ?? []).filter((c) => c.lastSender === "buyer").length,
    mine: (list ?? []).filter((c) => c.assignedTo === me).length,
    unassigned: (list ?? []).filter((c) => !c.assignedTo).length,
    all: list?.length ?? 0,
  }), [list, me]);

  async function act(action: "claim" | "release") {
    if (!activeId || busy) return;
    setBusy(true); setError(null);
    const res = await fetch(`/api/crm/support/${encodeURIComponent(activeId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError(action === "claim" ? "Chưa nhận được cuộc này. Hãy thử lại." : "Chưa trả được cuộc này. Hãy thử lại."); return; }
    await Promise.all([loadThread(activeId), loadList()]);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || busy) return;
    setBusy(true); setError(null);
    const temp: MessageView = { id: `tmp-${Date.now()}`, mine: true, body, author: null, pagePath: null, createdAt: new Date().toISOString(), pending: true };
    setThread((t) => t ? { ...t, messages: [...t.messages, temp] } : t);
    setDraft("");
    const res = await fetch(`/api/crm/support/${encodeURIComponent(activeId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", body }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setThread((t) => t ? { ...t, messages: t.messages.filter((m) => m.id !== temp.id) } : t);
      setDraft(body);
      setError(res?.status === 429 ? "Gửi quá nhanh. Đợi vài phút rồi thử lại." : "Chưa gửi được tin. Hãy thử lại.");
      return;
    }
    const data = await res.json().catch(() => null) as { message?: MessageView } | null;
    // Thay tin tạm bằng tin đã lưu trước khi tải lại, để tin không hiện hai lần.
    setThread((t) => t ? { ...t, messages: t.messages.flatMap((m) => m.id !== temp.id ? [m] : data?.message ? [data.message] : []) } : t);
    await Promise.all([loadThread(activeId), loadList()]);
  }

  const c = thread?.conversation;
  return <div className="flex h-[calc(100dvh-12rem)] min-h-[520px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
    <aside className={cx("w-full shrink-0 flex-col border-r border-ink-100 md:flex md:w-[340px]", activeId ? "hidden" : "flex")}>
      <div className="flex gap-1 overflow-x-auto border-b border-ink-100 p-2" role="tablist" aria-label="Lọc cuộc trò chuyện">
        {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
          className={cx("shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition", tab === t.key ? "bg-brand-700 text-white" : "text-ink-600 hover:bg-ink-100")}>
          {t.label} <span className={cx("ml-0.5 tabular-nums", tab === t.key ? "text-brand-100" : "text-ink-400")}>{counts[t.key]}</span>
        </button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list === null ? <p className="flex justify-center p-6 text-ink-400"><Loader2 className="h-5 w-5 animate-spin" /></p>
          : rows.length === 0 ? <div className="p-6 text-center text-sm text-ink-500">{tab === "waiting" ? "Không có người mua nào đang chờ trả lời." : "Chưa có cuộc trò chuyện nào."}</div>
          : <ul>{rows.map((r) => <li key={r.id}>
            <button type="button" onClick={() => setActiveId(r.id)} aria-current={r.id === activeId ? "true" : undefined}
              className={cx("flex w-full items-start gap-3 border-b border-ink-50 px-4 py-3 text-left transition", r.id === activeId ? "bg-brand-50" : "hover:bg-ink-50")}>
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{r.buyerLabel.slice(0, 1).toUpperCase()}<PresenceDot lastSeen={r.buyerLastSeen} label={presence.online} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cx("truncate text-[13.5px]", r.unread ? "font-bold text-ink-900" : "font-semibold text-ink-800")}>{r.buyerLabel}</span>
                  <span className="shrink-0 text-[11px] text-ink-400">{when(r.lastMessageAt)}</span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cx("min-w-0 flex-1 truncate text-[12.5px]", r.unread ? "font-semibold text-ink-800" : "text-ink-500")}>{r.lastSender === "staff" ? "Vexim: " : ""}{r.preview}</span>
                  {r.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-label="Chưa đọc" />}
                </span>
                <span className="mt-1 inline-block rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-600">{r.assignedName ? `Phụ trách: ${r.assignedName}` : "Chưa ai nhận"}</span>
              </span>
            </button>
          </li>)}</ul>}
      </div>
    </aside>

    <section className={cx("min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>
      {!activeId ? <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-ink-500"><Headset className="h-8 w-8 text-ink-300" />Chọn một cuộc trò chuyện để đọc và trả lời.</div>
        : !thread || !c ? <div className="flex flex-1 items-center justify-center text-ink-400">{error ? <p className="text-sm text-red-700">{error}</p> : <Loader2 className="h-5 w-5 animate-spin" />}</div>
        : <>
          <header className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
            <button type="button" onClick={() => setActiveId(null)} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:hidden" aria-label="Quay lại danh sách"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-ink-900">{c.buyerLabel}</p>
              <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-ink-500">
                <PresenceLine lastSeen={c.buyerLastSeen} labels={presence} locale="vi-VN" />
                <span className="truncate">{c.buyerEmail}</span>
                {c.buyerCrmId && <Link href={`/crm/buyers/${encodeURIComponent(c.buyerCrmId)}`} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">Hồ sơ người mua <ExternalLink className="h-3 w-3" /></Link>}
              </p>
            </div>
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-[12px] text-ink-700">{c.assignedName ? `Phụ trách: ${c.assignedName}` : "Chưa ai nhận"}</span>
            {thread.canReply && (c.assignedTo !== me
              ? <button type="button" onClick={() => void act("claim")} disabled={busy} className="btn btn-soft h-9 px-3 text-[13px]"><UserCheck className="h-4 w-4" />Nhận xử lý</button>
              : <button type="button" onClick={() => void act("release")} disabled={busy} className="btn btn-ghost h-9 px-3 text-[13px]"><UserMinus className="h-4 w-4" />Trả về chưa ai nhận</button>)}
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-ink-50/60 px-4 py-4">
            {thread.messages.map((m, i, all) => <div key={m.id} className={cx("flex flex-col", m.mine ? "items-end" : "items-start")}>
              {m.author && <span className="mb-0.5 px-1 text-[11px] font-semibold text-ink-500">{m.author}</span>}
              <div className={cx("max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-6 shadow-sm",
                m.mine ? "rounded-br-md bg-brand-700 text-white" : "rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-100", m.pending && "opacity-70")}>{m.body}</div>
              <span className="mt-0.5 flex items-center gap-2 px-1 text-[10.5px] text-ink-400">
                {when(m.createdAt)}
                {m.mine && <DeliveryTicks status={deliveryStatus(m, c.buyerReadAt)} labels={presence} showText={!all.slice(i + 1).some((x) => x.mine)} />}
                {m.pagePath && <a href={m.pagePath} target="_blank" rel="noopener" className="truncate text-brand-700 hover:underline">Đang xem: {m.pagePath}</a>}
              </span>
            </div>)}
            <div ref={endRef} />
          </div>
          {thread.canReply ? <form className="border-t border-ink-100 p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            {error && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-[12.5px] text-red-800">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea id="crm-support-reply" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={4000} placeholder="Trả lời người mua…" aria-label="Trả lời người mua"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
                className="input min-h-[44px] flex-1 resize-none text-[14px] leading-6" />
              <button type="submit" disabled={!draft.trim() || busy} className="btn btn-primary h-11 shrink-0 px-4 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}<span className="hidden sm:inline">Gửi</span>
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-400">Người mua thấy tên gọi của bạn và nhận email báo khi có trả lời. Trả lời một cuộc chưa ai nhận là tự nhận cuộc đó.</p>
          </form> : <p className="border-t border-ink-100 p-3 text-[12.5px] text-ink-500">Bạn chỉ có quyền xem. Nhân viên kinh doanh hoặc quản trị mới trả lời được.</p>}
        </>}
    </section>
  </div>;
}
