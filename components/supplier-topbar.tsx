"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";

type NoticeSummary = { key: string; title: string; at: string; read: boolean; kind?: string };

/**
 * Thanh trên của cổng nhà cung cấp: chỉ có chuông thông báo và một thanh tóm tắt.
 *
 * Không tải dữ liệu ở server: chuông gọi một endpoint nhẹ sau khi trang đã hiện, nên
 * bảng thiếu migration hay mạng chậm đều không làm chậm hay làm hỏng trang.
 */
export function SupplierTopbar() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NoticeSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/supplier-portal/notifications", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setUnread(Number(data.unread) || 0);
        setItems(Array.isArray(data.items) ? data.items : []);
        setLoaded(true);
      })
      .catch(() => { /* chuông im lặng khi không đọc được */ });
    return () => { alive = false; };
  }, []);

  const latest = items[0] ?? null;

  return <div className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
    <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center justify-end gap-2 pr-4 pl-16 sm:pr-6 lg:pr-8 lg:pl-8">
      <Link href="/supplier/portal/notifications" className="hidden text-[12px] font-semibold text-ink-500 hover:text-brand-800 sm:block">Hộp thông báo</Link>
      <div className="relative">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          aria-label={loaded && unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 transition hover:bg-ink-100 hover:text-ink-900">
          <Bell className="h-5 w-5" aria-hidden="true" />
          {loaded && unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-ink-900">
            {unread > 9 ? "9+" : unread}
          </span>}
        </button>

        {open && <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
              <span className="text-[13px] font-bold text-ink-900">Thông báo</span>
              <span className="text-[11px] text-ink-500">{loaded ? (unread ? `${unread} chưa đọc` : "Đã đọc hết") : "Đang tải"}</span>
            </div>
            {items.length ? <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto">
              {items.map((item) => <li key={item.key} className={`px-4 py-3 ${item.read ? "" : "bg-brand-50/40"}`}>
                <p className="text-[12.5px] leading-5 font-semibold text-ink-900">{item.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-500">{new Date(item.at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" })}</p>
              </li>)}
            </ul> : <p className="px-4 py-8 text-center text-[12px] text-ink-500">{loaded ? "Chưa có thông báo nào." : "Đang tải thông báo."}</p>}
            <Link href="/supplier/portal/notifications" onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 border-t border-ink-200 px-4 py-2.5 text-[12px] font-bold text-brand-700 hover:bg-ink-50">
              Mở hộp thông báo
            </Link>
          </div>
        </>}
      </div>
    </div>

    {loaded && unread > 0 && latest && <Link href="/supplier/portal/notifications"
      className="block border-t border-brand-100 bg-brand-50 hover:bg-brand-100">
      <span className="mx-auto flex w-full max-w-[1500px] items-center gap-2 px-4 py-2 text-[11.5px] text-brand-900 sm:px-6 lg:px-8">
        <span className="shrink-0 font-bold">{unread} thông báo chưa đọc</span>
        <span className="min-w-0 flex-1 truncate text-brand-800/90">{latest.title}</span>
      </span>
    </Link>}
    {loaded && unread === 0 && items.length > 0 && <div className="border-t border-ink-100 bg-white">
      <div className="mx-auto flex w-full max-w-[1500px] items-center gap-2 px-4 py-1.5 text-[11.5px] text-ink-500 sm:px-6 lg:px-8">
        <CheckCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">Bạn đã đọc hết thông báo.</span>
      </div>
    </div>}
  </div>;
}
