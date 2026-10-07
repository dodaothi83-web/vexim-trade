"use client";

import { useEffect, useRef } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Type,
  Undo2,
} from "lucide-react";

import { cx } from "@/components/ui";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/** Trình soạn thảo văn bản có định dạng — dùng cho phần nội dung email */
export function RichEditor({ value, onChange, placeholder, minHeight = 300 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const isInternal = useRef(false);

  useEffect(() => {
    if (ref.current && !isInternal.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
    isInternal.current = false;
  }, [value]);

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    isInternal.current = true;
    onChange(ref.current?.innerHTML ?? "");
  }

  function onInput() {
    isInternal.current = true;
    onChange(ref.current?.innerHTML ?? "");
  }

  function addLink() {
    const url = window.prompt("Địa chỉ liên kết (URL):", "https://");
    if (url) exec("createLink", url);
  }

  const Btn = ({
    onClick,
    title,
    children,
    active,
  }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    active?: boolean;
  }) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx(
        "flex h-7 w-7 items-center justify-center rounded text-ink-600 transition hover:bg-ink-100 hover:text-ink-900",
        active && "bg-ink-100 text-ink-900",
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="overflow-hidden rounded-b-lg border border-t-0 border-ink-200">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-200 bg-ink-50 px-1.5 py-1">
        <Btn onClick={() => exec("undo")} title="Hoàn tác (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec("redo")} title="Làm lại (Ctrl+Y)">
          <Redo2 className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-4 w-px bg-ink-200" />
        <Btn onClick={() => exec("bold")} title="Đậm (Ctrl+B)">
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec("italic")} title="Nghiêng (Ctrl+I)">
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec("underline")} title="Gạch chân (Ctrl+U)">
          <span className="text-[13px] font-bold underline">U</span>
        </Btn>
        <Btn onClick={() => exec("strikeThrough")} title="Gạch ngang">
          <Strikethrough className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-4 w-px bg-ink-200" />
        <select
          className="h-7 rounded bg-transparent px-1 text-[12px] text-ink-600 outline-none hover:bg-ink-100"
          defaultValue="p"
          onChange={(e) => exec("formatBlock", e.target.value)}
          title="Kiểu đoạn"
        >
          <option value="p">Đoạn thường</option>
          <option value="h2">Tiêu đề lớn</option>
          <option value="h3">Tiêu đề nhỏ</option>
          <option value="blockquote">Trích dẫn</option>
        </select>
        <select
          className="h-7 rounded bg-transparent px-1 text-[12px] text-ink-600 outline-none hover:bg-ink-100"
          defaultValue="3"
          onChange={(e) => exec("fontSize", e.target.value)}
          title="Cỡ chữ"
        >
          <option value="2">Nhỏ</option>
          <option value="3">Vừa</option>
          <option value="4">Lớn</option>
          <option value="5">Rất lớn</option>
        </select>
        <label
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded text-ink-600 transition hover:bg-ink-100"
          title="Màu chữ"
        >
          <Type className="h-4 w-4" />
          <input
            type="color"
            className="sr-only"
            onChange={(e) => exec("foreColor", e.target.value)}
          />
        </label>
        <span className="mx-1 h-4 w-px bg-ink-200" />
        <Btn onClick={() => exec("insertUnorderedList")} title="Danh sách dấu chấm">
          <List className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec("insertOrderedList")} title="Danh sách số">
          <ListOrdered className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-4 w-px bg-ink-200" />
        <Btn onClick={() => exec("justifyLeft")} title="Canh trái">
          <AlignLeft className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec("justifyCenter")} title="Canh giữa">
          <AlignCenter className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec("justifyRight")} title="Canh phải">
          <AlignRight className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-4 w-px bg-ink-200" />
        <Btn onClick={addLink} title="Chèn liên kết">
          <Link2 className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec("removeFormat")} title="Xoá định dạng">
          <Eraser className="h-4 w-4" />
        </Btn>
      </div>

      {/* Vùng soạn thảo */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Nội dung email"
        onInput={onInput}
        onBlur={onInput}
        data-placeholder={placeholder}
        className="rich-editor bg-white px-4 py-3 text-[14px] leading-relaxed text-ink-800 outline-none"
        style={{ minHeight }}
      />
    </div>
  );
}
