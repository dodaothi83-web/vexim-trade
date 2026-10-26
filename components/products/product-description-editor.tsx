"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold, Heading2, Heading3, Italic, List, Pilcrow, Redo2, Undo2,
} from "lucide-react";

import { sanitizeProductDescriptionInBrowser } from "./product-description-browser";

type EditorProps = {
  id?: string;
  name?: string;
  value: string;
  onChange?: (html: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  minHeight?: "md" | "lg";
};

function ToolbarButton({ label, active = false, disabled = false, onClick, children }: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700 disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-brand-100 text-brand-900" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"}`}
  >{children}</button>;
}

/** One constrained editor for source content and its staff-reviewed English translation. */
export function ProductDescriptionEditor({
  id,
  name,
  value,
  onChange,
  disabled = false,
  ariaLabel = "Mô tả chi tiết sản phẩm",
  minHeight = "md",
}: EditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        orderedList: false,
        strike: false,
        underline: false,
        trailingNode: false,
      }),
    ],
    content: sanitizeProductDescriptionInBrowser(value) || "<p></p>",
    editable: !disabled,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        class: `product-description product-description-input px-4 py-3 ${minHeight === "lg" ? "min-h-56" : "min-h-40"}`,
      },
    },
    onUpdate({ editor: currentEditor }) {
      onChangeRef.current?.(sanitizeProductDescriptionInBrowser(currentEditor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = sanitizeProductDescriptionInBrowser(value) || "<p></p>";
    const current = sanitizeProductDescriptionInBrowser(editor.getHTML()) || "<p></p>";
    if (next !== current) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return <div className={`overflow-hidden rounded-[0.625rem] border bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 ${disabled ? "border-ink-200 bg-ink-50" : "border-ink-300"}`}>
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-ink-200 bg-ink-50 px-2 py-1.5" role="toolbar" aria-label="Định dạng mô tả chi tiết">
      <ToolbarButton label="Đoạn văn" active={editor?.isActive("paragraph")} disabled={disabled || !editor} onClick={() => editor?.chain().focus().setParagraph().run()}><Pilcrow className="size-4" /></ToolbarButton>
      <ToolbarButton label="Tiêu đề 2" active={editor?.isActive("heading", { level: 2 })} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></ToolbarButton>
      <ToolbarButton label="Tiêu đề 3" active={editor?.isActive("heading", { level: 3 })} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="size-4" /></ToolbarButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-ink-200" aria-hidden="true" />
      <ToolbarButton label="In đậm (Ctrl+B)" active={editor?.isActive("bold")} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToolbarButton>
      <ToolbarButton label="In nghiêng (Ctrl+I)" active={editor?.isActive("italic")} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToolbarButton>
      <ToolbarButton label="Danh sách gạch đầu dòng" active={editor?.isActive("bulletList")} disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="size-4" /></ToolbarButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-ink-200" aria-hidden="true" />
      <ToolbarButton label="Hoàn tác" disabled={disabled || !editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 className="size-4" /></ToolbarButton>
      <ToolbarButton label="Làm lại" disabled={disabled || !editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 className="size-4" /></ToolbarButton>
    </div>
    {editor
      ? <EditorContent editor={editor} />
      : <div className={`bg-white px-4 py-3 ${minHeight === "lg" ? "min-h-56" : "min-h-40"}`} aria-hidden="true" />}
    {name && <input type="hidden" name={name} value={value} readOnly disabled={disabled} />}
  </div>;
}
