import Link from "next/link";
import { ChevronRight, CircleCheckBig } from "lucide-react";

import { VeximIcon, type VeximIconName } from "@/components/brand/vexim-icons";

/**
 * Danh sách "Việc cần làm" của CRM: thanh tổng quan theo loại việc (bấm để lọc), một danh sách gọn sắp
 * theo việc chờ lâu nhất, nhãn thời gian chờ có màu theo mức gấp. Cả dòng bấm được để làm việc đó.
 */
export type TaskType = "buyer" | "export" | "factory" | "documents" | "contact";
export interface Task { key: string; type: TaskType; who: string; what: string; since: string; href: string; action: string }

export const TASK_TYPES: Record<TaskType, { label: string; icon: VeximIconName }> = {
  buyer: { label: "Người mua chờ trả lời", icon: "messages" },
  export: { label: "Chứng từ xuất khẩu", icon: "delivery" },
  factory: { label: "Xác minh nhà máy", icon: "factory" },
  documents: { label: "Giấy tờ doanh nghiệp", icon: "document" },
  contact: { label: "Nhờ Vexim liên hệ", icon: "platform-support" },
};
export const TASK_ORDER: TaskType[] = ["buyer", "export", "factory", "documents", "contact"];

/** Quá 2 ngày là quá hạn; 1–2 ngày là sắp quá hạn. */
const OVERDUE_HOURS = 48;
const SOON_HOURS = 24;

export function waitedHours(iso: string, now = Date.now()): number | null {
  const ms = now - Date.parse(iso);
  return Number.isFinite(ms) && ms >= 0 ? ms / 3_600_000 : null;
}
export const isOverdue = (task: Task, now = Date.now()) => (waitedHours(task.since, now) ?? 0) >= OVERDUE_HOURS;

function waitLabel(iso: string, now: number): { text: string; tone: string } {
  const hours = waitedHours(iso, now);
  if (hours === null) return { text: "", tone: "" };
  const text = hours < 1 ? "Vừa gửi" : hours < 24 ? `Chờ ${Math.floor(hours)} giờ` : `Chờ ${Math.floor(hours / 24)} ngày`;
  if (hours >= OVERDUE_HOURS) return { text: `Quá hạn · ${text.toLowerCase()}`, tone: "bg-rose-50 text-rose-700 ring-rose-200" };
  if (hours >= SOON_HOURS) return { text, tone: "bg-amber-50 text-amber-800 ring-amber-200" };
  return { text, tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
}

const href = (type: TaskType | "all", overdue: boolean) => {
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (overdue) params.set("overdue", "1");
  const q = params.toString();
  return `/crm/tasks${q ? `?${q}` : ""}`;
};

export function TaskList({ tasks, type, overdueOnly, now = Date.now() }: { tasks: Task[]; type: TaskType | "all"; overdueOnly: boolean; now?: number }) {
  const sorted = [...tasks].sort((a, b) => a.since.localeCompare(b.since));
  const counts = Object.fromEntries(TASK_ORDER.map((t) => [t, { total: tasks.filter((x) => x.type === t).length, overdue: tasks.filter((x) => x.type === t && isOverdue(x, now)).length }])) as Record<TaskType, { total: number; overdue: number }>;
  const overdueTotal = tasks.filter((t) => isOverdue(t, now)).length;
  const shown = sorted.filter((t) => (type === "all" || t.type === type) && (!overdueOnly || isOverdue(t, now)));

  if (!tasks.length) return <div className="flex flex-col items-center rounded-2xl border border-ink-200 bg-white px-6 py-14 text-center">
    <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CircleCheckBig className="size-6" aria-hidden="true" /></span>
    <p className="mt-4 text-base font-bold text-ink-900">Đã xử lý hết việc</p>
    <p className="mt-1 max-w-sm text-sm leading-6 text-ink-500">Khi nhà cung cấp gửi hồ sơ mới hoặc người mua chờ trả lời, việc sẽ hiện ở đây.</p>
  </div>;

  return <div>
    {/* Tổng quan: mỗi loại việc một ô, bấm để lọc */}
    <nav aria-label="Lọc theo loại việc" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      <Link href={href("all", overdueOnly)} aria-current={type === "all" ? "page" : undefined}
        className={`rounded-xl border p-3.5 transition ${type === "all" ? "border-brand-700 bg-brand-50 ring-2 ring-brand-100" : "border-ink-200 bg-white hover:border-brand-300"}`}>
        <p className="min-h-8 text-xs font-semibold leading-4 text-ink-500">Tất cả</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-ink-900">{tasks.length}</p>
        <p className={`mt-0.5 text-[11.5px] font-semibold ${overdueTotal ? "text-rose-700" : "text-ink-400"}`}>{overdueTotal ? `${overdueTotal} quá hạn` : "Không có quá hạn"}</p>
      </Link>
      {TASK_ORDER.map((t) => {
        const c = counts[t];
        const on = type === t;
        return <Link key={t} href={href(t, overdueOnly)} aria-current={on ? "page" : undefined}
          className={`rounded-xl border p-3.5 transition ${on ? "border-brand-700 bg-brand-50 ring-2 ring-brand-100" : c.total ? "border-ink-200 bg-white hover:border-brand-300" : "border-ink-100 bg-ink-50/60 text-ink-400"}`}>
          <p className="flex min-h-8 items-start gap-1.5 text-xs font-semibold leading-4 text-ink-500"><VeximIcon name={TASK_TYPES[t].icon} className="size-4 shrink-0 text-brand-700" aria-hidden="true" /><span>{TASK_TYPES[t].label}</span></p>
          <p className={`mt-1 text-2xl font-black tabular-nums ${c.total ? "text-ink-900" : "text-ink-300"}`}>{c.total}</p>
          <p className={`mt-0.5 text-[11.5px] font-semibold ${c.overdue ? "text-rose-700" : "text-ink-400"}`}>{c.overdue ? `${c.overdue} quá hạn` : c.total ? "Trong hạn" : "Không có việc"}</p>
        </Link>;
      })}
    </nav>

    <div className="mt-5 flex flex-wrap items-center gap-3">
      <h2 className="mr-auto text-[15px] font-bold text-ink-900">{type === "all" ? "Tất cả việc" : TASK_TYPES[type].label} <span className="font-semibold text-ink-400">· {shown.length}</span></h2>
      <Link href={href(type, !overdueOnly)} aria-pressed={overdueOnly}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold ${overdueOnly ? "border-rose-300 bg-rose-50 text-rose-700" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
        <span aria-hidden="true" className={`size-2 rounded-full ${overdueOnly ? "bg-rose-600" : "bg-ink-300"}`} />Chỉ việc quá hạn</Link>
    </div>

    {shown.length ? <ul className="mt-3 overflow-hidden rounded-2xl border border-ink-200 bg-white">
      {shown.map((task) => {
        const wait = waitLabel(task.since, now);
        return <li key={task.key} className="border-b border-ink-100 last:border-0">
          <Link href={task.href} className="group flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-brand-50/40 sm:px-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><VeximIcon name={TASK_TYPES[task.type].icon} className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-bold text-ink-900">{task.who}</span>
              <span className="block text-[13px] leading-5 text-ink-600">{task.what}</span>
              <span className="mt-1 block text-[11.5px] font-medium text-ink-400 sm:hidden">{TASK_TYPES[task.type].label}</span>
            </span>
            <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 sm:inline-flex ${wait.tone}`}>{wait.text}</span>
            <span className="hidden w-44 shrink-0 items-center justify-end gap-1 text-[13px] font-bold text-brand-700 group-hover:text-brand-900 md:inline-flex">{task.action}<ChevronRight className="size-4" aria-hidden="true" /></span>
            <ChevronRight className="size-5 shrink-0 text-ink-300 md:hidden" aria-hidden="true" />
          </Link>
          <span className={`mx-4 mb-3 -mt-1.5 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 sm:hidden ${wait.tone} ml-[4.4rem]`}>{wait.text}</span>
        </li>;
      })}
    </ul> : <p className="mt-3 rounded-2xl border border-dashed border-ink-200 bg-white px-5 py-8 text-center text-sm text-ink-500">Không có việc nào khớp bộ lọc.</p>}
    <p className="mt-3 text-xs text-ink-500">Việc chờ lâu nhất ở trên cùng. Quá 2 ngày là quá hạn.</p>
  </div>;
}
