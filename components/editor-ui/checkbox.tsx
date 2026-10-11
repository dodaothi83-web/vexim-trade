"use client";

import type { InputHTMLAttributes } from "react";

import { cx } from "@/components/ui";

/** Ô chọn đơn giản: API giống checkbox của shadcn (checked / onCheckedChange). */
export function Checkbox({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "checked"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      className={cx("h-4 w-4 cursor-pointer accent-brand-700", className)}
      {...props}
    />
  );
}
