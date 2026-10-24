"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";

/**
 * Ô chọn tệp dùng chung: một khung rõ ràng thay cho dòng chữ nhỏ của
 * `<input type="file">` mặc định, để người dùng thấy ngay đây là chỗ tải tệp.
 *
 * - Dùng `name` khi tệp phải đi kèm form (FormData của form cha).
 * - Dùng `onPick` khi cần tải lên ngay sau khi chọn.
 * - `sr-only` giữ input thật trong form để trình duyệt vẫn kiểm tra `required`
 *   và vẫn mở hộp chọn tệp khi bấm vào khung.
 */
export function FilePicker({
  name,
  accept,
  multiple = false,
  required = false,
  requiredMark = false,
  title,
  hint,
  busy = false,
  disabled = false,
  onPick,
  compact = false,
  className = "",
}: {
  name?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  requiredMark?: boolean;
  title: string;
  hint?: string;
  busy?: boolean;
  disabled?: boolean;
  onPick?: (files: FileList | null) => void | Promise<void>;
  /** Bản gọn cho thẻ nhỏ: vẫn giữ khung, icon và nút chọn tệp nhưng thấp hơn. */
  compact?: boolean;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ name: string; size: number }[]>([]);
  const [dragging, setDragging] = useState(false);
  const inactive = disabled || busy;

  // Form cha gọi element.reset() sau khi tải xong: xoá luôn tên tệp đang hiện.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => setPicked([]);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function describe(files: FileList | null) {
    return Array.from(files ?? []).map((file) => ({ name: file.name, size: file.size }));
  }

  async function acceptFiles(files: FileList | null) {
    if (!files?.length) return;
    if (onPick) {
      setPicked(describe(files));
      try {
        await onPick(files);
      } finally {
        if (inputRef.current) inputRef.current.value = "";
        setPicked([]);
      }
      return;
    }
    setPicked(describe(files));
  }

  function onDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (inactive) return;
    const files = event.dataTransfer?.files ?? null;
    if (!files?.length) return;
    // Trình duyệt hiện đại cho phép gán FileList vào input; nơi không cho thì
    // người dùng bấm lại để chọn bằng hộp thoại, không mất dữ liệu gì.
    if (!onPick && inputRef.current) {
      try {
        inputRef.current.files = files;
      } catch {
        return;
      }
    }
    void acceptFiles(files);
  }

  const summary = picked.length === 0 ? "" : picked.length === 1
    ? `${picked[0].name} · ${formatSize(picked[0].size)}`
    : `${picked.length} tệp: ${picked.map((file) => file.name).join(", ")}`;

  return <label
    htmlFor={id}
    onDragOver={(event) => { if (!inactive) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={() => setDragging(false)}
    onDrop={onDrop}
    className={[
      compact
        ? "flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-sm transition"
        : "flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-sm transition",
      inactive
        ? "cursor-not-allowed border-ink-200 bg-ink-50/60 opacity-70"
        : dragging
          ? "border-brand-400 bg-brand-50/70"
          : "border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100",
      className,
    ].join(" ")}
  >
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ${compact ? "h-8 w-8" : "h-10 w-10"}`}>
      {busy ? <Loader2 className={`${compact ? "h-4 w-4" : "h-5 w-5"} animate-spin`} /> : <Upload className={`${compact ? "h-4 w-4" : "h-5 w-5"}`} />}
    </span>
    <span className="min-w-0 flex-1">
      <span className={`flex items-center gap-1 font-semibold text-ink-900 ${compact ? "text-[12.5px] leading-4" : ""}`}>
        {picked.length > 0 && !onPick ? <FileText className="h-4 w-4 shrink-0 text-ink-500" /> : null}
        <span className="min-w-0 truncate">{title}</span>
        {requiredMark && <span className="text-rose-700">*</span>}
      </span>
      <span className="mt-0.5 block truncate text-xs text-ink-500" title={summary || hint}>
        {busy ? "Đang tải tệp lên..." : summary || hint || "Bấm để chọn hoặc kéo tệp vào đây"}
      </span>
    </span>
    <span className={`hidden shrink-0 rounded-lg border border-ink-200 font-semibold text-ink-700 sm:inline-block ${compact ? "px-2 py-1 text-[10.5px]" : "px-3 py-1.5 text-xs"}`}>
      {picked.length > 0 ? "Đổi tệp" : disabled ? "Tạm khóa" : "Chọn tệp"}
    </span>
    <input
      ref={inputRef}
      id={id}
      type="file"
      name={name}
      accept={accept}
      multiple={multiple}
      required={required}
      disabled={inactive}
      className="sr-only"
      onChange={(event) => void acceptFiles(event.currentTarget.files)}
    />
  </label>;
}

function formatSize(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
