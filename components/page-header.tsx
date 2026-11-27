import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  sub,
  actions,
  breadcrumbs,
  help,
}: {
  title: string;
  /** Nhãn nhỏ phía trên tiêu đề, dùng cho các khu vực riêng tư như cổng nhà cung cấp. */

  eyebrow?: string;
  sub?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  /** Dòng gợi ý hướng dẫn liên quan dưới tiêu đề (cổng nhà cung cấp); tự ẩn khi không có bài. */
  help?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {breadcrumbs && <div className="mb-1.5">{breadcrumbs}</div>}
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-bold tracking-[0.16em] text-brand-700 uppercase">{eyebrow}</p>
        )}
        <h1 className="text-[22px] leading-tight font-black tracking-tight text-ink-900">
          {title}
        </h1>
        {sub && <p className="mt-1 text-[13px] text-ink-500">{sub}</p>}
        {help}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
