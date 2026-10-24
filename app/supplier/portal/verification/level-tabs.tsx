import Link from "next/link";
import { Factory, FileCheck2, Ship } from "lucide-react";

/**
 * Ba bước xác minh dùng chung một dải tab, để trang L1 (giấy tờ) và hai trang tự gửi
 * L2/L3 có cùng nhịp điều hướng và cùng cách đánh dấu bước đang mở.
 *
 * Mỗi bước vẫn là một trang riêng: bấm tab là mở đúng trang của bước đó, không gộp
 * nội dung ba cấp vào một trang.
 */
export const VERIFICATION_STEPS = [
  { level: 1, title: "Giấy tờ doanh nghiệp", href: "/supplier/portal/documents", icon: FileCheck2 },
  { level: 2, title: "Xác thực nhà máy", href: "/supplier/portal/verification/factory", icon: Factory },
  { level: 3, title: "Lịch sử xuất khẩu", href: "/supplier/portal/verification/export", icon: Ship },
] as const;

export function LevelTabs({ current }: { current: 1 | 2 | 3 }) {
  return <nav aria-label="Chọn bước xác minh" className="mt-4 grid gap-2.5 sm:grid-cols-3">
    {VERIFICATION_STEPS.map((step) => {
      const Icon = step.icon;
      const active = current === step.level;
      return <Link key={step.level} href={step.href} aria-current={active ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition ${active ? "border-brand-400 bg-brand-50 shadow-sm" : "border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40"}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-800"}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold tracking-wider text-ink-400 uppercase">Bước {step.level}/3</span>
          <span className={`block text-[13.5px] font-bold ${active ? "text-brand-900" : "text-ink-900"}`}>{step.title}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-800"}`}>
          {active ? "Đang mở" : "Mở"}
        </span>
      </Link>;
    })}
  </nav>;
}
