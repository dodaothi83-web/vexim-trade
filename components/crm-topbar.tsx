"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Bell, BellRing, CheckCheck } from "lucide-react";

export type CrmQueue = { href: string; label: string; count: number };

/**
 * Chuông thông báo của CRM. Nội dung là các hàng việc đang chờ, đếm ngay trong
 * layout mỗi lần mở trang, nên đây là chiều "NCC gửi lên" của thông báo hai chiều:
 * nhân viên thấy việc mới ngay trong app, không phải chờ email.
 *
 * Chiều còn lại (nhân viên duyệt/trả về) đi vào chuông trong cổng nhà cung cấp
 * cộng email. Không có bảng thông báo riêng: số liệu luôn khớp với hàng chờ thật.
 */
export function CrmTopbar({ queues }: { queues: CrmQueue[] }) {
  const [open, setOpen] = useState(false);
  const total = queues.reduce((sum, queue) => sum + queue.count, 0);

  return <div className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
    <div className="mx-auto flex h-14 w-full max-w-[1500px] items-center justify-end gap-2 px-4 pr-4 sm:px-6 lg:px-8">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={total > 0 ? `Thông báo, ${total} việc đang chờ` : "Thông báo"}
          className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-ink-100 hover:text-ink-900 ${open ? "bg-ink-100 text-ink-900" : "text-ink-600"}`}
        >
          {total > 0 ? <BellRing className="h-5 w-5" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
          {total > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-ink-900">
            {total > 99 ? "99+" : total}
          </span>}
        </button>

        {open && <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed inset-x-3 top-14 z-20 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[340px]">
            <div className="flex items-center justify-between gap-2 border-b border-ink-200 px-4 py-3">
              <span className="text-[13px] font-bold text-ink-900">Việc đang chờ</span>
              <span className="text-[11px] text-ink-500">{total ? `${total} việc` : "Đã xử lý hết"}</span>
            </div>

            {queues.length ? <ul className="divide-y divide-ink-100">
              {queues.map((queue) => <li key={queue.href}>
                <Link
                  href={queue.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-brand-50/40"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] font-semibold text-ink-900">
                    <span className="min-w-0 truncate">{queue.label}</span>
                  </span>
                  <span className="rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900">{queue.count}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
                </Link>
              </li>)}
            </ul> : <p className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-ink-600">
              <CheckCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Không còn việc nào chờ xử lý.
            </p>}

            <div className="border-t border-ink-200 bg-ink-50/60 px-4 py-2 text-[11px] leading-4 text-ink-500">
              Số việc tự trừ khi bạn duyệt, trả về hoặc xác nhận xong. NCC vẫn nhận email và chuông trong cổng của họ.
            </div>
          </div>
        </>}
      </div>
    </div>
  </div>;
}
