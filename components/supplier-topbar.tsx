"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, ChevronRight } from "lucide-react";

import { markSupplierNoticeReadAction } from "@/app/supplier/portal/notice-actions";

type NoticeItem = {
  key: string;
  title: string;
  detail?: string;
  at: string;
  read: boolean;
  kind?: string;
  /** Trang đúng để xử lý thông báo; thiếu thì quay về tổng quan cổng. */
  href?: string;
};

/** Nhịp làm mới chuông. Đủ nhanh để thấy việc mới mà không đập CSDL liên tục. */
const POLL_MS = 20_000;

function when(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}

function NoticeIcon({ kind, unread }: { kind?: string; unread: boolean }) {
  const tone = kind === "rfq" ? "bg-brand-50 text-brand-700"
    : kind === "verification" ? "bg-emerald-50 text-emerald-700"
    : kind === "contact" ? "bg-sky-50 text-sky-700"
    : kind === "product" ? "bg-amber-50 text-amber-800" : "bg-ink-100 text-ink-700";
  return <span className={`relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
    <Bell className="h-4 w-4" aria-hidden="true" />
    {unread && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-white" aria-hidden="true" />}
  </span>;
}

/**
 * Thanh trên của cổng nhà cung cấp. Thông báo nằm gọn trong chuông: huy hiệu số chưa đọc
 * và danh sách mở ra tại chỗ. Không có trang thông báo riêng, không có dải trạng thái
 * thông báo nào khác trên trang.
 *
 * Chuông tự làm mới (20 giây một lần khi tab đang hiện, và ngay khi quay lại tab), nên
 * quyết định của Vexim hiện ra mà nhà cung cấp không phải tải lại trang. Mỗi dòng bấm
 * được và mở đúng trang cần xử lý; bấm ra ngoài hoặc nhấn Esc thì danh sách tự đóng.
 */
export function SupplierTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [readsKnown, setReadsKnown] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const previousUnread = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/supplier-portal/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const nextUnread = Number(data.unread) || 0;
      // Nhảy số mới thì nháy chuông một nhịp để người dùng biết vừa có thay đổi.
      if (previousUnread.current !== null && nextUnread > previousUnread.current) {
        setFresh(true);
        window.setTimeout(() => setFresh(false), 4000);
      }
      previousUnread.current = nextUnread;
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnread(nextUnread);
      setReadsKnown(data.readsKnown !== false);
      setLoaded(true);
    } catch {
      /* chuông im lặng khi không đọc được */
    }
  }, []);

  // Tự làm mới: theo nhịp khi tab đang hiện, và ngay lập tức khi quay lại tab.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onFocus = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Đổi trang thì đóng danh sách, tránh panel treo lại trên trang mới.
  useEffect(() => { setOpen(false); }, [pathname]);

  // Esc để đóng, và bấm ra ngoài panel cũng đóng (ngoài lớp phủ toàn màn hình).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onPointer = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  async function markRead(key: string) {
    const target = items.find((n) => n.key === key);
    if (!target || target.read) return;
    setSaving(key);
    setItems((prev) => prev.map((n) => (n.key === key ? { ...n, read: true } : n)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      const form = new FormData();
      form.set("notice_key", key);
      await markSupplierNoticeReadAction(form);
    } catch {
      // Lưu không được thì tải lại để chuông không hiện trạng thái sai.
      void load();
    } finally {
      setSaving(null);
    }
  }

  /** Bấm vào thông báo: đánh dấu đã đọc rồi mở đúng trang của việc đó. */
  function openNotice(notice: NoticeItem) {
    setOpen(false);
    if (!notice.read) void markRead(notice.key);
    router.push(notice.href || "/supplier/portal");
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await load();
  }

  return <div className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
    <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center justify-end gap-2 pr-4 pl-16 sm:pr-6 lg:pr-8 lg:pl-8">
      <div className="relative">
        <button type="button" onClick={() => void toggle()} aria-expanded={open}
          aria-label={loaded && unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
          className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-ink-100 hover:text-ink-900 ${open ? "bg-ink-100 text-ink-900" : "text-ink-600"}`}>
          {loaded && unread > 0 ? <BellRing className="h-5 w-5" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
          {loaded && unread > 0 && <span className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-ink-900 ${fresh ? "animate-pulse ring-2 ring-amber-200" : ""}`}>
            {unread > 9 ? "9+" : unread}
          </span>}
        </button>

        {open && <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div ref={panelRef} className="fixed inset-x-3 top-14 z-20 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[380px]">
            <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
              <span className="text-[13px] font-bold text-ink-900">Thông báo</span>
              <span className="text-[11px] text-ink-500">
                {!loaded ? "Đang tải" : !readsKnown ? "Chưa đọc được dấu đã đọc" : unread ? `${unread} chưa đọc` : "Đã đọc hết"}
              </span>
            </div>

            {items.length ? <ul className="max-h-[min(60vh,420px)] divide-y divide-ink-100 overflow-y-auto">
              {items.map((n) => {
                const isUnread = !n.read && readsKnown;
                return <li key={n.key} className={isUnread ? "bg-brand-50/40" : ""}>
                  <div className="flex items-start gap-3 px-4 py-3 transition hover:bg-brand-50/60">
                    <NoticeIcon kind={n.kind} unread={isUnread} />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openNotice(n)}
                        className="block w-full text-left"
                      >
                        <span className="flex items-start gap-1">
                          <span className="min-w-0 flex-1 text-[12.5px] leading-5 font-semibold text-ink-900">{n.title}</span>
                          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                        </span>
                        {n.detail && <span className="mt-0.5 block text-[11.5px] leading-5 text-ink-600">{n.detail}</span>}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[10.5px] text-ink-400">{when(n.at)}</span>
                        <Link href={n.href || "/supplier/portal"} onClick={() => { if (!n.read) void markRead(n.key); }}
                          className="text-[10.5px] font-semibold text-brand-700 hover:underline">
                          Mở việc này
                        </Link>
                        {isUnread && <button type="button" onClick={() => void markRead(n.key)} disabled={saving === n.key}
                          className="text-[10.5px] font-semibold text-ink-500 hover:underline disabled:opacity-50">
                          {saving === n.key ? "Đang lưu" : "Đánh dấu đã đọc"}
                        </button>}
                      </div>
                    </div>
                  </div>
                </li>;
              })}
            </ul> : <p className="px-4 py-10 text-center text-[12px] text-ink-500">
              {loaded ? "Chưa có thông báo nào." : "Đang tải thông báo."}
            </p>}

            <p className="flex items-start gap-1.5 border-t border-ink-200 bg-ink-50 px-4 py-2.5 text-[10.5px] leading-4 text-ink-500">
              <CheckCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              Hộp thư Vexim là kênh làm việc chính; thông báo ở đây chỉ nhắc việc và mở thẳng tới chỗ cần xem.
            </p>
          </div>
        </>}
      </div>
    </div>
  </div>;
}
