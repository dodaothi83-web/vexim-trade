import Link from "next/link";

/** Hai trang của Gói thành viên: vận hành hằng ngày và cấu hình gói (ít khi sửa). */
export function PlansTabs({ active }: { active: "overview" | "catalog" }) {
  const tab = (key: "overview" | "catalog", href: string, label: string) => (
    <Link href={href} aria-current={active === key ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${active === key ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"}`}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Gói thành viên" className="mb-5 flex gap-1 border-b border-ink-200">
      {tab("overview", "/crm/plans", "Tổng quan")}
      {tab("catalog", "/crm/plans/catalog", "Nội dung và giá")}
    </nav>
  );
}
