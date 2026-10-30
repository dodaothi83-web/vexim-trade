"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "@/components/ui";

/**
 * Dropdown tối giản với API giống shadcn Select (Select, SelectTrigger, SelectValue,
 * SelectContent, SelectItem). Không phụ thuộc Radix để giữ bundle nhẹ.
 */

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  labels: Record<string, string>;
  registerLabel: (value: string, label: string) => void;
}

const SelectContext = createContext<SelectContextValue | null>(null);

function useSelectContext(): SelectContextValue {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("Select components phải nằm trong <Select>");
  return ctx;
}

export function Select({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});

  const registerLabel = (itemValue: string, label: string) => {
    setLabels((prev) => (prev[itemValue] === label ? prev : { ...prev, [itemValue]: label }));
  };

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, labels, registerLabel }}>
      <div className="relative inline-block">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className, children }: { className?: string; children: ReactNode }) {
  const { open, setOpen } = useSelectContext();
  return (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cx(
        "inline-flex items-center justify-between gap-2 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-600",
        className,
      )}
    >
      {children}
      <span aria-hidden className="text-ink-400">▾</span>
    </button>
  );
}

export function SelectValue() {
  const { value, labels } = useSelectContext();
  return <span className="truncate">{labels[value] ?? value}</span>;
}

export function SelectContent({ children }: { children: ReactNode }) {
  const { open, setOpen } = useSelectContext();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="listbox"
      className="absolute left-0 top-full z-50 mt-1 max-h-72 min-w-full overflow-auto rounded-lg border border-ink-200 bg-white py-1 shadow-pop"
    >
      {children}
    </div>
  );
}

export function SelectItem({ value, children }: { value: string; children: string }) {
  const { value: selected, onValueChange, setOpen, registerLabel } = useSelectContext();

  // Nhãn là chuỗi nên so sánh theo giá trị, không gây cập nhật lặp vô hạn
  useEffect(() => {
    registerLabel(value, children);
  }, [value, children, registerLabel]);

  return (
    <div
      role="option"
      aria-selected={selected === value}
      tabIndex={0}
      onClick={() => {
        onValueChange(value);
        setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onValueChange(value);
          setOpen(false);
        }
      }}
      className={cx(
        "cursor-pointer px-3 py-1.5 text-sm text-ink-800 hover:bg-ink-100",
        selected === value && "font-semibold text-brand-700",
      )}
    >
      {children}
    </div>
  );
}
