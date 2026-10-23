"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, CheckCheck } from "lucide-react";

import { markSupplierNoticeReadAction } from "@/app/supplier/portal/notice-actions";

type NoticeItem = { key: string; title: string; detail?: string; at: string; read: boolean; kind?: string };

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
 * Dữ liệu lấy sau khi trang đã hiện, qua một endpoint nhẹ; bảng thiếu migration thì chuông
 * chỉ im lặng, không làm hỏng trang đang mở.
 */
export function SupplierTopbar() {
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [readsKnown, setReadsKnown] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/supplier-portal/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnread(Number(data.unread) || 0);
      setReadsKnown(data.readsKnown !== false);
      setLoaded(true);
    } catch {
      /* chuông im lặng khi không đọc được */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
          {loaded && unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-ink-900">
            {unread > 9 ? "9+" : unread}
          </span>}
        </button>

        {open && <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed inset-x-3 top-14 z-20 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[380px]">
            <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
              <span className="text-[13px] font-bold text-ink-900">Thông báo</span>
              <span className="text-[11px] text-ink-500">
                {!loaded ? "Đang tải" : !readsKnown ? "Chưa đọc được dấu đã đọc" : unread ? `${unread} chưa đọc` : "Đã đọc hết"}
              </span>
            </div>

            {items.length ? <ul className="max-h-[min(60vh,420px)] divide-y divide-ink-100 overflow-y-auto">
              {items.map((n) => {
                const isUnread = !n.read && readsKnown;
                return <li key={n.key} className={`flex items-start gap-3 px-4 py-3 ${isUnread ? "bg-brand-50/40" : ""}`}>
                  <NoticeIcon kind={n.kind} unread={isUnread} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-5 font-semibold text-ink-900">{n.title}</p>
                    {n.detail && <p className="mt-0.5 text-[11.5px] leading-5 text-ink-600">{n.detail}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-[10.5px] text-ink-400">{when(n.at)}</span>
                      {isUnread && <button type="button" onClick={() => void markRead(n.key)} disabled={saving === n.key}
                        className="text-[10.5px] font-semibold text-brand-700 hover:underline disabled:opacity-50">
                        {saving === n.key ? "Đang lưu" : "Đánh dấu đã đọc"}
                      </button>}
                    </div>
                  </div>
                </li>;
              })}
            </ul> : <p className="px-4 py-10 text-center text-[12px] text-ink-500">
              {loaded ? "Chưa có thông báo nào." : "Đang tải thông báo."}
            </p>}

            <p className="flex items-start gap-1.5 border-t border-ink-200 bg-ink-50 px-4 py-2.5 text-[10.5px] leading-4 text-ink-500">
              <CheckCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              Hộp thư Vexim là kênh làm việc chính; thông báo ở đây chỉ nhắc việc.
            </p>
          </div>
        </>}
      </div>
    </div>
  </div>;
}
