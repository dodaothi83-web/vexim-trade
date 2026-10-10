import type { LabelHTMLAttributes } from "react";

import { cx } from "@/components/ui";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("text-sm font-medium text-ink-800", className)} {...props} />;
}
