import type { ReactNode } from "react";

export function PageHeader({
  title,
  sub,
  actions,
  breadcrumbs,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {breadcrumbs && <div className="mb-1.5">{breadcrumbs}</div>}
        <h1 className="text-[22px] leading-tight font-black tracking-tight text-ink-900">
          {title}
        </h1>
        {sub && <p className="mt-1 text-[13px] text-ink-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
