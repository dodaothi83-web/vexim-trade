import Link from "next/link";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function cx(...parts: (string | false | null | undefined)[]) {
  return twMerge(parts.filter(Boolean).join(" "));
}

export function Button({
  variant = "ghost",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "soft" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      {...props}
      className={cx(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "ghost" && "btn-ghost",
        variant === "soft" && "btn-soft",
        variant === "danger" && "btn-danger",
        size === "sm" && "px-2.5 py-1.5 text-[13px]",
        className,
      )}
    />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx("card", className)}>{children}</div>;
}

export function SectionTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 px-4 py-3">
      <div>
        <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Badge({
  children,
  className,
  color,
}: {
  children: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        !color && "bg-ink-100 text-ink-600",
        className,
      )}
      style={
        color
          ? { backgroundColor: `${color}1a`, color, boxShadow: `inset 0 0 0 1px ${color}33` }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon}
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-ink-500">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-ink-300">/</span>}
          {it.href ? (
            <Link href={it.href} className="transition hover:text-brand-700">
              {it.label}
            </Link>
          ) : (
            <span className="font-semibold text-ink-800">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function formatMoney(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString("en-US", { useGrouping: true })}`;
}

/** Định dạng số có dấu phẩy phân cách nghìn, không phụ thuộc locale runtime */
export function group(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(date.getTime())) return d;
  // định dạng thủ công để server và browser cho ra chuỗi giống hệt nhau (tránh lỗi hydration)
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} ngày trước`;
  return formatDate(iso);
}
