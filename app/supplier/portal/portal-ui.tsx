import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Mảnh giao diện dùng chung cho các trang của cổng nhà cung cấp.
 *
 * Mỗi khối ở đây chỉ là khung và nhịp khoảng cách, không chứa dữ liệu và không gọi
 * store: trang nào tự tải dữ liệu của trang đó. Nhờ vậy một bảng thiếu migration
 * không thể làm hỏng khung của toàn cổng.
 */

export function date(value: string) {
  return new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
}

/** Khung nội dung một mục: tiêu đề, mô tả, số đếm và hành động ở góc phải. */
export function Panel({ id, icon, title, sub, count, action, children, flush }: {
  id?: string;
  icon?: ReactNode;
  title: string;
  sub?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  /** Bỏ đệm trong thân khung khi bên trong đã là danh sách chia dòng. */
  flush?: boolean;
}) {
  return <section id={id} className="scroll-mt-20 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
          {icon}{title}
          {typeof count === "number" && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{count}</span>}
        </h2>
        {sub && <p className="mt-1 text-[11.5px] leading-5 text-ink-500">{sub}</p>}
      </div>
      {action}
    </div>
    {flush ? children : <div className="p-5">{children}</div>}
  </section>;
}

/** Ô số liệu bấm được ở đầu trang tổng quan. */
export function Kpi({ href, icon, label, value, note, attention = false }: {
  href: string;
  icon: ReactNode;
  label: string;
  value: number;
  note: string;
  attention?: boolean;
}) {
  return <Link href={href} className="group flex min-h-[136px] flex-col rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md">
    <span className="flex items-center">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${attention ? "bg-amber-50 text-amber-800" : "bg-brand-50 text-brand-700"}`}>{icon}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="ml-auto h-4 w-4 text-ink-300 transition group-hover:text-brand-600">
        <path d="M5 11 11 5M11 5H6.5M11 5v4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
    <span className="mt-3 block text-[26px] leading-none font-black tracking-tight tabular-nums text-ink-900">{value.toLocaleString("vi-VN")}</span>
    <span className="mt-1.5 block text-[13px] leading-4 font-bold text-ink-800">{label}</span>
    <span className="mt-auto block pt-1 text-[11px] leading-4 text-ink-500">{note}</span>
  </Link>;
}

/** Dòng trống trong danh sách, cùng nhịp với CRM. */
export function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="px-5 py-9 text-center text-[13px] text-ink-500">{children}</p>;
}

/** Trạng thái ba cấp xác minh, dùng lại ở trang tổng quan và trang hồ sơ. */
export function LevelChip({ label, on, pending }: { label: string; on: boolean; pending?: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-emerald-50 text-emerald-800" : pending ? "bg-amber-50 text-amber-800" : "bg-ink-100 text-ink-600"}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-600" : pending ? "bg-amber-500" : "bg-ink-400"}`} aria-hidden="true" />
    {label}
  </span>;
}

/** Một cấp xác minh kèm trạng thái đọc được, không dùng nhãn "đã xác minh" gộp. */
export function VerifyRow({ level, title, status, on, note }: { level: string; title: string; status: string; on: boolean; note?: string }) {
  return <div className="flex items-start gap-3 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2.5">
    <span className={`mt-0.5 flex h-6 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-black ${on ? "bg-emerald-600 text-white" : "bg-ink-200 text-ink-700"}`}>{level}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[13px] font-semibold text-ink-900">{title}</span>
      <span className={`mt-0.5 block text-[11.5px] ${on ? "font-semibold text-emerald-700" : "text-ink-600"}`}>{status}</span>
      {note && <span className="mt-0.5 block text-[11px] text-ink-500">{note}</span>}
    </span>
  </div>;
}

/** Tiến trình mở cổng, hiển thị dọc trong cột phụ. */
export function PortalSteps({ stages }: { stages: { label: string; state: "done" | "current" | "todo"; note: string }[] }) {
  return <ol className="space-y-2">{stages.map((stage, i) => (
    <li key={stage.label} className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${stage.state === "done" ? "bg-brand-700 text-white" : stage.state === "current" ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300" : "bg-ink-100 text-ink-500"}`}>
        {stage.state === "done" ? "✓" : i + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13px] font-semibold ${stage.state === "todo" ? "text-ink-600" : "text-ink-900"}`}>{stage.label}</span>
        <span className={`mt-0.5 block text-[11.5px] ${stage.state === "done" ? "font-semibold text-brand-800" : "text-ink-500"}`}>{stage.note}</span>
      </span>
    </li>))}
  </ol>;
}

/** Cặp nhãn và giá trị trong hồ sơ doanh nghiệp. Giá trị có thể là email/website
 *  dài không có khoảng trắng — break-words để không tràn lề trên mobile. */
export function Info({ label, value }: { label: string; value?: string | null }) {
  return <div className="min-w-0"><dt className="text-[11px] font-semibold text-ink-500">{label}</dt><dd className="mt-0.5 text-[13px] break-words text-ink-900">{value || "-"}</dd></div>;
}
