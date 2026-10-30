import type { TextareaHTMLAttributes } from "react";

import { cx } from "@/components/ui";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "flex min-h-[80px] w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
