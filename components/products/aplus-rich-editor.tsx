"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Italic, List } from "lucide-react";

import { parseAplusRich, serializeAplusRich, type AplusRichNode, type AplusRichRun } from "@/lib/products/aplus";

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Chữ A+ đã lưu (dạng **đậm**, *nghiêng*, "- ") thành HTML cho ô soạn. */
function richToHtml(value: string): string {
  const runs = (list: AplusRichRun[]) => list.map((run) => {
    let html = escapeHtml(run.t).replace(/\n/g, "<br>");
    if (run.i) html = `<em>${html}</em>`;
    if (run.b) html = `<strong>${html}</strong>`;
    return html;
  }).join("");
  const nodes = parseAplusRich(value);
  let html = "";
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].kind === "li") {
      let items = "";
      while (i < nodes.length && nodes[i].kind === "li") items += `<li><p>${runs(nodes[i++].runs)}</p></li>`;
      i--;
      html += `<ul>${items}</ul>`;
    } else html += `<p>${runs(nodes[i].runs)}</p>`;
  }
  return html || "<p></p>";
}

/** Nội dung ô soạn thành chữ A+ để lưu. */
function docToRich(doc: JSONContent): string {
  const inline = (node: JSONContent | undefined): AplusRichRun[] => (node?.content ?? []).flatMap((child): AplusRichRun[] => {
    if (child.type === "hardBreak") return [{ t: "\n" }];
    if (child.type !== "text" || !child.text) return [];
    const marks = new Set((child.marks ?? []).map((mark) => mark.type));
    return [{ t: child.text, ...(marks.has("bold") ? { b: true as const } : {}), ...(marks.has("italic") ? { i: true as const } : {}) }];
  });
  const nodes: AplusRichNode[] = [];
  for (const block of doc.content ?? []) {
    if (block.type === "bulletList") {
      for (const item of block.content ?? []) {
        const runs = (item.content ?? []).flatMap((child, k) => k ? [{ t: " " }, ...inline(child)] : inline(child));
        if (runs.some((run) => run.t.trim())) nodes.push({ kind: "li", runs });
      }
    } else {
      const runs = inline(block);
      if (runs.some((run) => run.t.trim())) nodes.push({ kind: "p", runs });
    }
  }
  return serializeAplusRich(nodes);
}

/**
 * Ô soạn đoạn chữ A+: gõ như Word (đậm, nghiêng, gạch đầu dòng hiện ngay; Ctrl/Cmd+B, Ctrl/Cmd+I),
 * gõ tiếng Việt bằng bộ gõ bình thường. Lưu thành chữ có dấu đánh dấu nhẹ để dịch và hiển thị.
 */
export function AplusRichEditor({ value, onChange, disabled, labels, placeholder, rows, labelledBy }: {
  value: string; onChange: (value: string) => void; disabled: boolean; rows: number; placeholder?: string; labelledBy?: string;
  labels: { bold: string; italic: string; bullets: string };
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const emitted = useRef(value);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, link: false,
        orderedList: false, strike: false, underline: false, trailingNode: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: richToHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox", "aria-multiline": "true", ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        class: "product-description aplus-rich-input px-3 py-2 text-sm outline-none",
        style: `min-height:${Math.max(3, rows) * 1.5 + 1}rem`,
      },
    },
    onUpdate({ editor: current, transaction }) {
      if (!transaction.docChanged) return;
      const next = docToRich(current.getJSON());
      emitted.current = next;
      onChangeRef.current(next);
    },
  });

  // Nội dung đổi từ bên ngoài (đổi tiếng Việt/English, dịch lại, áp mẫu): nạp lại ô soạn.
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(richToHtml(value), { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => { editor?.setEditable(!disabled, false); }, [disabled, editor]);

  const button = (label: string, active: boolean, run: () => void, icon: React.ReactNode) =>
    <button type="button" title={label} aria-pressed={active} disabled={disabled || !editor} onMouseDown={(e) => e.preventDefault()} onClick={run}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold disabled:opacity-40 ${active ? "bg-brand-100 text-brand-900" : "text-ink-600 hover:bg-white"}`}>{icon}{label}</button>;

  return <div className={`mt-1 overflow-hidden rounded-lg border bg-white font-normal focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 ${disabled ? "border-ink-200 bg-ink-50" : "border-ink-300"}`}>
    <div role="toolbar" className="flex gap-1 border-b border-ink-200 bg-ink-50 px-1.5 py-1">
      {button(labels.bold, !!editor?.isActive("bold"), () => editor?.chain().focus().toggleBold().run(), <Bold className="size-3" aria-hidden="true" />)}
      {button(labels.italic, !!editor?.isActive("italic"), () => editor?.chain().focus().toggleItalic().run(), <Italic className="size-3" aria-hidden="true" />)}
      {button(labels.bullets, !!editor?.isActive("bulletList"), () => editor?.chain().focus().toggleBulletList().run(), <List className="size-3" aria-hidden="true" />)}
    </div>
    {editor ? <EditorContent editor={editor} /> : <div style={{ minHeight: `${Math.max(3, rows) * 1.5 + 1}rem` }} aria-hidden="true" />}
  </div>;
}
