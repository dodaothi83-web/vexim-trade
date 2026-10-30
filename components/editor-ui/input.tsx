import type { InputHTMLAttributes } from "react";

import { cx } from "@/components/ui";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "flex h-9 w-full rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
