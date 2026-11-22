"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, Loader2, Maximize2, MessageCircle, Package, Send, X } from "lucide-react";
import { VeximPlatformSupportIcon } from "@/components/brand/vexim-icons";
import { cx } from "@/components/ui";
import { DeliveryTicks, PRESENCE_LABELS, PresenceDot, PresenceLine, deliveryStatus } from "@/components/chat/presence";

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
  /** Chỉ cần cho cửa sổ chat mở từ trang sản phẩm. */
  attached?: string;
  removeAttached?: string;
  quickTitle?: string;
  newConversation?: string;
  productUnavailable?: string;
  /** Nút hiện khi có tin mới trong lúc người đọc đang kéo lên xem tin cũ. */
  newMessages?: string;
  /** Phía người mua: nhà cung cấp chưa trả lời quá 48 giờ, Vexim đang liên hệ. */
  followUp?: string;
  followUpAction?: string;
}

interface ConversationView { id: string; counterpart: string; counterpartHref: string | null; productName: string | null; preview: string | null; lastMessageAt: string | null; unread: boolean; counterpartReadAt?: string | null; counterpartLastSeen?: string | null; veximFollowingUp?: boolean }
/** Dòng danh sách không có tin mới trong lượt hỏi lại: chỉ phần đổi theo thời gian. */
type ConversationStatus = Pick<ConversationView, "id" | "lastMessageAt" | "unread" | "counterpartReadAt" | "counterpartLastSeen" | "veximFollowingUp">;
interface ProductCardView { id: string; name: string; imageUrl: string | null; href: string | null; price: string | null }
interface MessageView { id: string; mine: boolean; body: string; productName: string | null; product?: ProductCardView | null; createdAt: string; pending?: boolean }

/** Sản phẩm người mua đang xem khi mở cửa sổ chat từ trang sản phẩm. */
export interface ChatDraftProduct { id: string; name: string; imageUrl: string | null; supplierName: string; detail?: string }

/** Cuộc trò chuyện chưa có trên máy chủ: chỉ tạo khi người mua gửi tin đầu tiên. */
const NEW_ID = "new";

const LIST_POLL_MS = 15_000;
/** Danh sách hỏi lại chỉ xin cuộc có tin mới; cứ chừng này lại tải đủ một lần để tên bên kia đổi cũng hiện ra. */
const LIST_FULL_MS = 5 * 60_000;
const THREAD_POLL_MS = 6_000;
/** Cuộc im lặng quá 2 phút (không tin mới, mình không gõ) thì hỏi lại thưa hơn. */
const THREAD_IDLE_POLL_MS = 15_000;
const ACTIVE_WINDOW_MS = 2 * 60_000;
/** Hỏi tin mới lùi lại chừng này so với tin cuối, phòng tin ghi gần như cùng lúc; trùng thì bỏ theo id. */
const OVERLAP_MS = 10_000;
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

/** Thẻ sản phẩm trong khung chat: ảnh, tên, giá tham khảo, bấm để mở trang sản phẩm. */
function ProductCard({ card, label, mine }: { card: ProductCardView; label: string; mine: boolean }) {
  const body = <>
    {card.imageUrl
      ? <img src={card.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-ink-100" />
      : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-ink-100"><Package className="h-6 w-6 text-ink-400" aria-hidden="true" /></span>}
    <span className="min-w-0 flex-1">
      <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      <span className="line-clamp-2 text-[13px] font-semibold leading-5 text-ink-900">{card.name}</span>
      {card.price && <span className="mt-0.5 block text-[12px] font-semibold text-brand-800">{card.price}</span>}
    </span>
  </>;
  const cls = cx("mb-1.5 flex w-full max-w-[340px] items-center gap-3 rounded-xl border border-ink-200 bg-white p-2.5 text-left shadow-sm", mine ? "self-end" : "self-start");
  return card.href
    ? <a href={card.href} target="_blank" rel="noopener" className={cx(cls, "transition hover:border-brand-300 hover:shadow")} data-testid="chat-product-card">{body}</a>
    : <div className={cls} data-testid="chat-product-card">{body}</div>;
}

/**
 * Khung chat hai cột: danh sách cuộc trò chuyện bên trái, nội dung bên phải. Trên điện thoại
 * chỉ hiện một cột. Tin mới được hỏi lại máy chủ định kỳ khi tab đang mở, không cần kết nối
 * thời gian thực. Enter để gửi, Shift+Enter để xuống dòng.
 */
export function ChatWorkspace({ side, labels, locale, initialId = null, product = null, supplier = null, initialDraft = "", quickQuestions = [], variant = "page", onClose, closeLabel = "Close", expandHref, expandLabel = "Open full page" }: {
  side: "buyer" | "supplier"; labels: ChatLabels; locale: string; initialId?: string | null;
  /** Có khi mở từ trang sản phẩm: thẻ sản phẩm được đính kèm sẵn phía trên ô nhập. */
  product?: ChatDraftProduct | null;
  /** Có khi mở từ trang nhà cung cấp: cuộc trò chuyện với nhà cung cấp này, không gắn sản phẩm. */
  supplier?: { id: string; name: string } | null;
  /** Câu mở đầu điền sẵn (vd. mã RFQ khi mở từ trang yêu cầu); người dùng sửa được trước khi gửi. */
  initialDraft?: string;
  quickQuestions?: string[];
  variant?: "page" | "popup";
  onClose?: () => void;
  closeLabel?: string;
  /** Khung bám cạnh: nút mở trang Tin nhắn đầy đủ (giữ đúng cuộc đang xem). */
  expandHref?: string;
  expandLabel?: string;
}) {
  const popup = variant === "popup";
  const presence = PRESENCE_LABELS[locale.startsWith("vi") ? "vi" : "en"];
  const [list, setList] = useState<ConversationView[] | null>(null);
  // Cửa sổ trên trang sản phẩm chờ tra cuộc cũ xong mới chọn cuộc, để không nháy sang cuộc khác.
  const [activeId, setActiveId] = useState<string | null>(product || supplier ? null : initialId);
  const [productThreadId, setProductThreadId] = useState<string | null>(null);
  const [attached, setAttached] = useState<ChatDraftProduct | null>(product);
  const [thread, setThread] = useState<{ conversation: ConversationView; messages: MessageView[] } | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Người đọc đang ở cuối khung tin: có tin mới thì cuộn theo; đang kéo lên đọc tin cũ thì
  // không giật xuống, chỉ hiện nút "Tin nhắn mới".
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const lastSeenTail = useRef<{ conversation: string | null; message: string | null }>({ conversation: null, message: null });
  // Cuộc đang mở và tin đã có, đọc trong các lần hỏi lại mà không phải dựng lại vòng hỏi.
  const activeRef = useRef(activeId);
  const threadRef = useRef(thread);
  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  useEffect(() => { threadRef.current = thread; }, [thread]);
  // Lần cuối có trao đổi (mở cuộc, tin mới, mình gõ hoặc gửi): còn trong 2 phút thì hỏi lại
  // 6 giây/lần, lâu hơn thì giãn ra 15 giây/lần cho đỡ tải.
  const lastActivity = useRef(Date.now());
  const bump = useCallback(() => { lastActivity.current = Date.now(); }, []);

  const listRef = useRef(list);
  useEffect(() => { listRef.current = list; }, [list]);
  const lastFullList = useRef(0);
  /**
   * Danh sách cuộc. Lần đầu (và 5 phút một lần) tải đủ; các lần hỏi lại gửi `since` = tin mới nhất
   * đang có lùi 10 giây: máy chủ chỉ trả đủ các cuộc có tin mới, cuộc khác chỉ trả chưa đọc / đã xem
   * / online, tên và câu xem trước giữ nguyên ở đây.
   */
  const loadList = useCallback(async (full = false) => {
    const known = listRef.current;
    const newest = known?.reduce((max, r) => Math.max(max, Date.parse(r.lastMessageAt ?? "") || 0), 0) ?? 0;
    const since = !full && known?.length && newest > 0 && Date.now() - lastFullList.current < LIST_FULL_MS ? new Date(newest - OVERLAP_MS).toISOString() : null;
    const res = await fetch(`/api/chat?side=${side}${since ? `&since=${encodeURIComponent(since)}` : ""}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) { setList((rows) => rows ?? []); return; }
    const data = await res.json() as { conversations: Array<ConversationView | ConversationStatus>; partial?: boolean };
    // Cuộc đang mở được đánh dấu đã đọc ở mỗi lượt hỏi tin: không để danh sách về muộn bật lại chấm đỏ.
    const read = <T extends ConversationStatus>(r: T): T => r.id === activeRef.current ? { ...r, unread: false } : r;
    if (!data.partial) {
      lastFullList.current = Date.now();
      const rows = (data.conversations as ConversationView[]).map(read);
      setList(rows);
      if (!product && !supplier) setActiveId((current) => current ?? (window.matchMedia("(min-width: 768px)").matches ? rows[0]?.id ?? null : null));
      return;
    }
    // Có dòng gọn mà ở đây chưa biết cuộc đó (vừa đổi danh sách): tải đủ lại cho chắc.
    const knownIds = new Set((listRef.current ?? []).map((r) => r.id));
    const missing = data.conversations.some((c) => !("counterpart" in c) && !knownIds.has(c.id));
    setList((rows) => {
      const byId = new Map((rows ?? []).map((r) => [r.id, r]));
      return data.conversations.flatMap((c) => {
        if ("counterpart" in c) return [read(c)];
        const previous = byId.get(c.id);
        return previous ? [read({ ...previous, ...c })] : [];
      });
    });
    if (missing) void loadList(true);
  }, [side, product, supplier]);

  /**
   * Tải một cuộc. Lần đầu tải đủ; các lần hỏi lại (`incremental`) chỉ xin tin mới hơn tin cuối
   * đang có (lùi 10 giây cho chắc, trùng thì bỏ theo id), máy chủ không phải trả lại cả cuộc.
   */
  const loadThread = useCallback(async (id: string, incremental = false) => {
    const current = threadRef.current;
    const tail = incremental && current?.conversation.id === id ? [...current.messages].reverse().find((m) => !m.pending) : undefined;
    const after = tail && Number.isFinite(Date.parse(tail.createdAt)) ? new Date(Date.parse(tail.createdAt) - OVERLAP_MS).toISOString() : null;
    const res = await fetch(`/api/chat/${encodeURIComponent(id)}?side=${side}${after ? `&after=${encodeURIComponent(after)}` : ""}`, { cache: "no-store" }).catch(() => null);
    // Người dùng đã chuyển sang cuộc khác trong lúc chờ: bỏ kết quả cũ.
    if (activeRef.current !== id) return;
    if (!res?.ok) { if (!incremental) setError(labels.loadError); return; }
    const data = await res.json() as { conversation: ConversationView; messages: MessageView[]; partial?: boolean };
    if (activeRef.current !== id) return;
    setThread((t) => {
      if (!data.partial) return { conversation: data.conversation, messages: data.messages };
      // Phần tin mới của một lượt hỏi cũ về sau khi đã đổi cuộc: không ghép vào đâu cả.
      if (!t || t.conversation.id !== id) return t;
      const known = new Set(t.messages.map((m) => m.id));
      let pending = t.messages.filter((m) => m.pending);
      const fresh = data.messages.filter((m) => {
        if (known.has(m.id)) return false;
        // Tin của mình đã lưu trước khi lời đáp POST về: thay đúng bản đang gửi, không hiện hai lần.
        const twin = m.mine ? pending.find((p) => p.body === m.body) : undefined;
        if (twin) pending = pending.filter((p) => p !== twin);
        return true;
      });
      // Bản gọn không có tên bên kia: giữ tên từ lần tải đầu, chỉ cập nhật trạng thái.
      const conversation = { ...t.conversation, ...data.conversation };
      if (!fresh.length) return { ...t, conversation };
      bump();
      return { conversation, messages: [...t.messages.filter((m) => !m.pending), ...fresh, ...pending] };
    });
    setList((rows) => rows?.map((r) => r.id === id ? { ...r, unread: false } : r) ?? rows);
  }, [side, labels.loadError, bump]);

  // Số cuộc chưa đọc đổi thì báo thanh công cụ / menu cổng cập nhật huy hiệu ngay.
  const unreadCount = list ? list.filter((c) => c.unread).length : null;
  useEffect(() => {
    if (unreadCount !== null) window.dispatchEvent(new CustomEvent("vexim:chat-unread", { detail: { side, unread: unreadCount } }));
  }, [unreadCount, side]);

  useEffect(() => { void loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Mở từ trang sản phẩm: nếu đã từng hỏi nhà cung cấp này thì mở lại đúng cuộc đó,
  // chưa có thì hiện một cuộc mới chưa lưu, gửi tin đầu tiên mới tạo trên máy chủ.
  useEffect(() => {
    if (!product && !supplier) return;
    let cancelled = false;
    const lookup = product ? `productId=${encodeURIComponent(product.id)}` : `supplierId=${encodeURIComponent(supplier!.id)}`;
    void (async () => {
      const res = await fetch(`/api/chat/start?${lookup}`, { cache: "no-store" }).catch(() => null);
      const data = res?.ok ? await res.json().catch(() => null) as { conversationId: string | null } | null : null;
      if (cancelled) return;
      const id = data?.conversationId ?? NEW_ID;
      setProductThreadId(id);
      setActiveId(id);
    })();
    return () => { cancelled = true; };
  }, [product, supplier]);
  // Danh sách: hỏi lại 15 giây/lần khi tab đang mở; quay lại tab thì hỏi ngay, không chờ lượt sau.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void loadList(); };
    const timer = window.setInterval(tick, LIST_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [loadList]);
  useEffect(() => {
    if (!activeId) { setThread(null); return; }
    setError(null);
    setUnseen(false);
    bump();
    if (activeId === NEW_ID) {
      setThread({ conversation: { id: NEW_ID, counterpart: product?.supplierName ?? supplier?.name ?? "", counterpartHref: null, productName: product?.name ?? null, preview: null, lastMessageAt: null, unread: false }, messages: [] });
      return;
    }
    // Chuyển cuộc: không để nội dung cuộc trước hiện dưới tên cuộc mới trong lúc tải.
    setThread((t) => t?.conversation.id === activeId ? t : null);
    void loadThread(activeId);
    if (!popup) {
      const url = new URL(window.location.href);
      url.searchParams.set("c", activeId);
      window.history.replaceState(null, "", url);
    }
    let timer = 0;
    let stopped = false;
    const delay = () => Date.now() - lastActivity.current < ACTIVE_WINDOW_MS ? THREAD_POLL_MS : THREAD_IDLE_POLL_MS;
    const tick = async () => {
      if (document.visibilityState === "visible") await loadThread(activeId, true);
      if (!stopped) timer = window.setTimeout(tick, delay());
    };
    timer = window.setTimeout(tick, delay());
    const onVisible = () => { if (document.visibilityState === "visible") { bump(); void loadThread(activeId, true); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [activeId, loadThread, popup, product, supplier, bump]);
  // Mở lại cuộc cũ đang nói về đúng sản phẩm này thì không đính kèm lại, tránh thẻ lặp.
  const attachChecked = useRef(false);
  useEffect(() => {
    if (attachChecked.current || !attached || !thread || activeId !== productThreadId || activeId === NEW_ID || thread.conversation.id !== activeId) return;
    attachChecked.current = true;
    const lastProduct = [...thread.messages].reverse().find((m) => m.product)?.product;
    if (lastProduct?.id === attached.id) setAttached(null);
  }, [thread, attached, activeId, productThreadId]);
  // Cuộn: mở cuộc thì xuống cuối; tin mới thì chỉ cuộn khi đang ở cuối hoặc tin do mình gửi.
  useEffect(() => {
    const conversation = thread?.conversation.id ?? null;
    const last = thread?.messages[thread.messages.length - 1] ?? null;
    const previous = lastSeenTail.current;
    lastSeenTail.current = { conversation, message: last?.id ?? null };
    if (!thread || (previous.conversation === conversation && previous.message === (last?.id ?? null))) return;
    if (previous.conversation !== conversation || !last || last.mine || atBottom.current) {
      endRef.current?.scrollIntoView({ block: "end" });
      setUnseen(false);
    } else {
      setUnseen(true);
    }
  }, [thread]);
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom.current) setUnseen(false);
  }
  function jumpToLatest() {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    setUnseen(false);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    if (body.length > MAX) { setError(labels.tooLong); return; }
    setSending(true); setError(null); bump();
    const withProduct = attached && activeId === productThreadId ? attached : null;
    const temp: MessageView = { id: `tmp-${Date.now()}`, mine: true, body, productName: withProduct?.name ?? null,
      product: withProduct ? { id: withProduct.id, name: withProduct.name, imageUrl: withProduct.imageUrl, href: null, price: null } : null,
      createdAt: new Date().toISOString(), pending: true };
    setThread((t) => t ? { ...t, messages: [...t.messages, temp] } : t);
    setDraft("");
    const creating = activeId === NEW_ID && (withProduct || supplier);
    const res = await fetch(creating ? "/api/chat/start" : `/api/chat/${encodeURIComponent(activeId)}?side=${side}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creating ? (withProduct ? { productId: withProduct.id, body } : { supplierId: supplier!.id, body })
        : { body, ...(withProduct ? { productId: withProduct.id } : {}) }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      setThread((t) => t ? { ...t, messages: t.messages.filter((m) => m.id !== temp.id) } : t);
      setDraft(body);
      setError(res?.status === 429 ? labels.rateLimited : res?.status === 400 && withProduct ? labels.productUnavailable ?? labels.failed : labels.failed);
      return;
    }
    // Thẻ sản phẩm chỉ đi kèm tin đầu tiên sau khi mở cửa sổ; các tin sau là chat thường.
    if (withProduct) setAttached(null);
    if (creating) {
      const { id } = await res.json() as { id: string };
      setThread((t) => t ? { ...t, conversation: { ...t.conversation, id }, messages: t.messages.map((m) => m.id === temp.id ? { ...m, pending: false } : m) } : t);
      setProductThreadId(id);
      setActiveId(id);
      void loadList();
      return;
    }
    const data = await res.json() as { message: MessageView };
    // Lượt hỏi lại có thể đã mang tin này về trước: khi đó chỉ bỏ bản đang gửi.
    setThread((t) => t ? { ...t, messages: t.messages.some((m) => m.id === data.message.id) ? t.messages.filter((m) => m.id !== temp.id)
      : t.messages.map((m) => m.id === temp.id ? data.message : m) } : t);
    setList((rows) => rows ? [{ ...rows.find((r) => r.id === activeId)!, preview: body, lastMessageAt: data.message.createdAt, ...(withProduct ? { productName: withProduct.name } : {}) }, ...rows.filter((r) => r.id !== activeId)] : rows);
  }

  const active = useMemo(() => list?.find((c) => c.id === activeId) ?? null, [list, activeId]);
  const rows = useMemo(() => {
    if (activeId !== NEW_ID || !thread || thread.conversation.id !== NEW_ID) return list;
    return [thread.conversation, ...(list ?? [])];
  }, [list, activeId, thread]);
  const showAttached = attached && activeId !== null && activeId === productThreadId;
  const headerProduct = active?.productName ?? thread?.conversation.productName ?? null;

  const fullPageHref = expandHref ? `${expandHref}${activeId && activeId !== NEW_ID ? `?c=${encodeURIComponent(activeId)}` : ""}` : null;

  // Khung bám cạnh (popup): danh sách cuộc trò chuyện ở bên phải, sát thanh công cụ, như Alibaba.
  return <div className={cx("flex overflow-hidden bg-white", popup ? "h-full md:flex-row-reverse" : "h-[calc(100dvh-11rem)] min-h-[480px] rounded-2xl border border-ink-200 shadow-sm")}>
    {/* Danh sách cuộc trò chuyện */}
    <aside className={cx("w-full shrink-0 flex-col border-ink-100 md:flex", popup ? "md:w-64 md:border-l xl:w-72" : "border-r md:w-80", activeId ? "hidden" : "flex")}>
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3.5">
        <MessageCircle className="h-5 w-5 text-brand-700" aria-hidden="true" />
        <h2 className="text-[15px] font-bold text-ink-900">{labels.title}</h2>
        {list && list.some((c) => c.unread) && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{list.filter((c) => c.unread).length}</span>}
        {popup && <span className="ml-auto flex items-center gap-0.5">
          {fullPageHref && <a href={fullPageHref} aria-label={expandLabel} title={expandLabel} className="hidden rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:inline-flex"><Maximize2 className="h-[18px] w-[18px]" /></a>}
          {onClose && <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100"><X className="h-5 w-5" /></button>}
        </span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? <p className="flex items-center gap-2 p-4 text-sm text-ink-500"><Loader2 className="h-4 w-4 animate-spin" /></p>
          : rows.length === 0 ? <div className="p-6 text-center"><p className="text-sm font-semibold text-ink-800">{labels.empty}</p><p className="mt-1 text-xs leading-5 text-ink-500">{labels.emptyHint}</p></div>
          : <ul>{rows.map((c) => <li key={c.id}>
            <button type="button" onClick={() => setActiveId(c.id)} aria-current={c.id === activeId ? "true" : undefined}
              className={cx("flex w-full items-start gap-3 border-b border-ink-50 px-4 py-3 text-left transition", c.id === activeId ? "bg-brand-50" : "hover:bg-ink-50")}>
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{c.counterpart.slice(0, 1).toUpperCase()}<PresenceDot lastSeen={c.counterpartLastSeen} label={presence.online} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cx("truncate text-[13.5px]", c.unread ? "font-bold text-ink-900" : "font-semibold text-ink-800")}>{c.counterpart}</span>
                  <span className="shrink-0 text-[11px] text-ink-400">{shortTime(c.lastMessageAt, locale)}</span>
                </span>
                {c.productName && <span className="block truncate text-[11.5px] text-ink-500">{c.productName}</span>}
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cx("min-w-0 flex-1 truncate text-[12.5px]", c.unread ? "font-semibold text-ink-800" : "text-ink-500")}>{c.id === NEW_ID ? labels.newConversation ?? "" : c.preview}</span>
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
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">{thread.conversation.counterpart.slice(0, 1).toUpperCase()}<PresenceDot lastSeen={thread.conversation.counterpartLastSeen} label={presence.online} /></span>
          <div className="min-w-0">
            {thread.conversation.counterpartHref
              ? <Link href={thread.conversation.counterpartHref} className="block truncate text-[14.5px] font-bold text-ink-900 hover:underline">{thread.conversation.counterpart}</Link>
              : <p className="truncate text-[14.5px] font-bold text-ink-900">{thread.conversation.counterpart}</p>}
            <p className="flex min-w-0 items-center gap-2 text-[12px] text-ink-500">
              {thread.conversation.id !== NEW_ID && <PresenceLine lastSeen={thread.conversation.counterpartLastSeen} labels={presence} locale={locale} />}
              {headerProduct && <span className="flex min-w-0 items-center gap-1 truncate"><Package className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{headerProduct}</span></span>}
            </p>
          </div>
          {popup && onClose && <button type="button" onClick={onClose} aria-label={closeLabel} className="ml-auto rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:hidden"><X className="h-5 w-5" /></button>}
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-ink-50/60 px-4 py-4" role="log">
          <p className="mx-auto max-w-md rounded-lg bg-white px-3 py-2 text-center text-[11.5px] leading-4 text-ink-500 shadow-sm">{labels.notice}</p>
          {(() => {
            // Thẻ sản phẩm chỉ hiện khi cuộc trò chuyện chuyển sang một sản phẩm khác.
            let shownProduct: string | null = null;
            const lastMine = [...thread.messages].reverse().find((x) => x.mine)?.id;
            return thread.messages.map((m) => {
              const card = m.product ?? (m.productName ? { id: `name:${m.productName}`, name: m.productName, imageUrl: null, href: null, price: null } : null);
              const showCard = card && card.id !== shownProduct;
              if (card) shownProduct = card.id;
              return <div key={m.id} className={cx("flex flex-col", m.mine ? "items-end" : "items-start")}>
                {showCard && <ProductCard card={card} label={labels.about} mine={m.mine} />}
                <div title={fullTime(m.createdAt, locale)} className={cx("max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-6 shadow-sm",
                  m.mine ? "rounded-br-md bg-brand-700 text-white" : "rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-100", m.pending && "opacity-70")}>{m.body}</div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[10.5px] text-ink-400">
                  {shortTime(m.createdAt, locale)}
                  {m.mine && <DeliveryTicks status={deliveryStatus(m, thread.conversation.counterpartReadAt)} labels={presence} showText={m.id === lastMine} />}
                </span>
              </div>;
            });
          })()}
          {thread.messages.length === 0 && quickQuestions.length > 0 && <div className="mx-auto max-w-lg pt-6 text-center">
            <p className="text-[13px] font-semibold text-ink-700">{labels.quickTitle}</p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">{quickQuestions.map((q) => <button key={q} type="button"
              onClick={() => setDraft((d) => d.trim() ? `${d.trim()}\n${q}` : q)}
              className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink-700 shadow-sm transition hover:border-brand-300 hover:text-brand-800">{q}</button>)}</div>
          </div>}
          {side === "buyer" && thread.conversation.veximFollowingUp && labels.followUp && <div role="status" data-testid="chat-vexim-follow-up"
            className="mx-auto flex max-w-md items-start gap-2.5 rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-[12.5px] leading-5 text-ink-700 shadow-sm">
            <VeximPlatformSupportIcon size={20} strokeWidth={2.4} className="mt-0.5 shrink-0 text-brand-700" />
            <p>{labels.followUp}{labels.followUpAction && <> <Link href="/buyer/account?tab=vexim" className="font-semibold text-brand-700 underline underline-offset-2">{labels.followUpAction}</Link></>}</p>
          </div>}
          <div ref={endRef} />
        </div>
        {unseen && <button type="button" onClick={jumpToLatest} data-testid="chat-new-messages"
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-700 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-800">
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />{labels.newMessages ?? "New messages"}
        </button>}
        </div>
        <form className="border-t border-ink-100 p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          {error && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-1.5 text-[12.5px] text-red-800">{error}</p>}
          {showAttached && <div className="mb-2 flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/70 p-2 pr-1.5" data-testid="chat-attached-product">
            {attached.imageUrl ? <img src={attached.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-100"><Package className="h-5 w-5 text-ink-400" /></span>}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{labels.attached}</p>
              <p className="truncate text-[13px] font-semibold text-ink-900">{attached.name}</p>
              {attached.detail && <p className="truncate text-[11.5px] text-ink-500">{attached.detail}</p>}
            </div>
            {activeId !== NEW_ID && <button type="button" onClick={() => setAttached(null)} aria-label={labels.removeAttached} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><X className="h-4 w-4" /></button>}
          </div>}
          <div className="flex items-end gap-2">
            <textarea id={popup ? "ask-supplier-message" : undefined} autoFocus={popup || !!initialDraft} value={draft}
              // Câu mở đầu điền sẵn: con trỏ đặt sau câu đó để gõ tiếp, không chèn lên trước.
              onFocus={(e) => { const el = e.currentTarget; if (initialDraft && el.value === initialDraft) el.setSelectionRange(el.value.length, el.value.length); }} onChange={(e) => { setDraft(e.target.value); bump(); }} rows={2} maxLength={MAX} placeholder={labels.placeholder}
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
