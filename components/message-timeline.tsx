"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Inbox } from "lucide-react";
import { cx } from "@/components/ui";
import type { TimelineItem, TimelineParty } from "@/lib/mail/timeline";

const KIND_LABEL = { auto: "Tự động", staff: "Nhân viên", reply: "Trả lời" } as const;
type Filter = "all" | TimelineParty;

function when(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(d)
    : "";
}

/**
 * Timeline thư của một hồ sơ: một dòng thời gian, mỗi thư có nhãn bên liên quan và loại
 * thư. Thư tự động thu gọn một dòng; thư nhận chưa đọc có viền xanh để thấy ngay.
 */
export function MessageTimeline({ items, empty, title = "Thư từ" }: { items: TimelineItem[]; empty: string; title?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = { all: items.length, buyer: items.filter((i) => i.party === "buyer").length, supplier: items.filter((i) => i.party === "supplier").length };
  const shown = filter === "all" ? items : items.filter((i) => i.party === filter);
  const unread = items.filter((i) => i.unread).length;

  return <section className="card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-500">
        <Inbox className="h-4 w-4" aria-hidden="true" /> {title} ({items.length})
        {unread > 0 && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10.5px] font-bold normal-case tracking-normal text-sky-800">{unread} mới</span>}
      </h2>
      {counts.buyer > 0 && counts.supplier > 0 && <div role="group" aria-label="Lọc thư" className="flex gap-1 rounded-lg border border-ink-200 bg-ink-50 p-0.5">
        {([["all", "Tất cả"], ["buyer", "Người mua"], ["supplier", "Nhà cung cấp"]] as const).map(([key, label]) =>
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
            className={cx("rounded-md px-2.5 py-1 text-[11.5px] font-semibold", filter === key ? "bg-white text-brand-800 shadow-sm" : "text-ink-500 hover:text-ink-800")}>
            {label} <span className="tabular-nums text-ink-400">{counts[key]}</span>
          </button>)}
      </div>}
    </div>
    {items.length === 0 ? <p className="mt-3 text-[13px] text-ink-500">{empty}</p>
      : <ul className="mt-3 space-y-1.5">{shown.map((item) => <TimelineRow key={item.id} item={item} />)}</ul>}
  </section>;
}

function PartyChip({ item }: { item: TimelineItem }) {
  if (item.party === "buyer") return <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-800">Người mua</span>;
  const label = item.partyName ? `Nhà cung cấp · ${item.partyName}` : "Nhà cung cấp";
  const chip = <span className="max-w-[16rem] truncate rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-800">{label}</span>;
  return item.partyHref ? <Link href={item.partyHref} className="hover:underline">{chip}</Link> : chip;
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const Arrow = item.inbound ? ArrowDownLeft : ArrowUpRight;
  // Thư tự động: một dòng nhạt, mở ra mới thấy nội dung.
  if (item.kind === "auto") return <li>
    <details className="group rounded-md px-2.5 py-1.5 text-[12px] text-ink-500 hover:bg-ink-50">
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <Arrow className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-label={item.inbound ? "Nhận" : "Gửi"} />
        <span className="shrink-0 rounded bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-500">{KIND_LABEL.auto}</span>
        <PartyChip item={item} />
        <span className="min-w-0 flex-1 truncate">{item.subject}</span>
        {item.failed && <span className="shrink-0 text-[10.5px] font-semibold text-red-700">Gửi lỗi</span>}
        <span className="shrink-0 text-[11px] text-ink-400">{when(item.at)}</span>
      </summary>
      {item.body && <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-2 font-sans text-[12px] text-ink-700">{item.body}</pre>}
    </details>
  </li>;
  return <li className={cx("rounded-md border bg-white p-2.5", item.unread ? "border-sky-200 border-l-4 border-l-sky-500" : "border-ink-200")}>
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className={cx("inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[10.5px] font-semibold", item.inbound ? "bg-sky-100 text-sky-800" : "bg-brand-100 text-brand-800")}>
        <Arrow className="h-3 w-3" aria-hidden="true" /> {item.inbound ? "Nhận" : "Gửi"}
      </span>
      <PartyChip item={item} />
      <span className="rounded bg-ink-100 px-1.5 text-[10px] font-semibold text-ink-600">{KIND_LABEL[item.kind]}</span>
      {item.unread && <span className="rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">Mới</span>}
      {item.failed && <span className="text-[10.5px] font-semibold text-red-700">Gửi lỗi</span>}
      <span className="ml-auto text-[11px] text-ink-400">{when(item.at)}</span>
    </div>
    <p className="mt-1 truncate text-[13px] font-semibold text-ink-800">{item.subject}</p>
    {item.body && <details className="mt-1">
      <summary className="cursor-pointer text-[11px] text-ink-500 hover:text-ink-700">Xem nội dung…</summary>
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-ink-50 p-2 font-sans text-[12.5px] leading-5 text-ink-700">{item.body}</pre>
    </details>}
  </li>;
}
