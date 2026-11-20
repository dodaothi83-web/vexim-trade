"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Heading3, List, Pilcrow } from "lucide-react";

import { parseRichIntro, richIntroFromNodes, type RichIntroNode, type RichIntroRun } from "@/lib/rich-intro";

export type RichIntroEditorCopy = { paragraph: string; heading: string; list: string; bold: string; chars: string };
export const RICH_INTRO_COPY: Record<"vi" | "en", RichIntroEditorCopy> = {
  vi: { paragraph: "Đoạn văn", heading: "Tiêu đề phụ", list: "Gạch đầu dòng", bold: "In đậm", chars: "{count}/{max} ký tự" },
  en: { paragraph: "Paragraph", heading: "Subheading", list: "Bullet list", bold: "Bold", chars: "{count}/{max} characters" },
};

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const runsHtml = (runs: RichIntroRun[]) => runs.map((run) => {
  const text = escape(run.t).replace(/\n/g, "<br>");
  return run.b ? `<strong>${text}</strong>` : text;
}).join("");

function toHtml(value: string): string {
  const nodes = parseRichIntro(value);
  let html = "";
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === "li") {
      html += "<ul>";
      while (i < nodes.length && nodes[i].kind === "li") { html += `<li>${runsHtml(nodes[i].runs)}</li>`; i++; }
      i--;
      html += "</ul>";
    } else html += node.kind === "h3" ? `<h3>${runsHtml(node.runs)}</h3>` : `<p>${runsHtml(node.runs)}</p>`;
  }
  return html || "<p><br></p>";
}

/** Đọc chữ trong một khối: đậm (strong, b, hoặc font-weight đậm), xuống dòng (br). */
function inlineRuns(el: Node, bold = false, out: RichIntroRun[] = []): RichIntroRun[] {
  el.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) { if (child.textContent) out.push({ t: child.textContent.replace(/ /g, " "), ...(bold ? { b: true as const } : {}) }); return; }
    if (!(child instanceof HTMLElement)) return;
    if (child.tagName === "BR") { out.push({ t: "\n" }); return; }
    const weight = child.style.fontWeight;
    const isBold = bold || child.tagName === "B" || child.tagName === "STRONG" || weight === "bold" || Number(weight) >= 600;
    inlineRuns(child, isBold, out);
  });
  return out;
}

function fromDom(root: HTMLElement): string {
  const nodes: RichIntroNode[] = [];
  let loose: RichIntroRun[] = [];
  const flushLoose = () => { if (loose.some((run) => run.t.trim())) nodes.push({ kind: "p", runs: loose }); loose = []; };
  root.childNodes.forEach((child) => {
    if (!(child instanceof HTMLElement)) { if (child.textContent) loose.push({ t: child.textContent }); return; }
    const tag = child.tagName;
    if (tag === "BR" || tag === "B" || tag === "STRONG" || tag === "SPAN") { loose.push(...inlineRuns({ childNodes: [child] } as unknown as Node)); return; }
    flushLoose();
    if (tag === "UL" || tag === "OL") {
      child.querySelectorAll(":scope > li").forEach((li) => nodes.push({ kind: "li", runs: trimRuns(inlineRuns(li)) }));
    } else if (/^H[1-6]$/.test(tag)) nodes.push({ kind: "h3", runs: trimRuns(inlineRuns(child)).map(({ t }) => ({ t: t.replace(/\n/g, " ") })) });
    else nodes.push({ kind: "p", runs: trimRuns(inlineRuns(child)) });
  });
  flushLoose();
  return richIntroFromNodes(nodes.filter((node) => node.runs.some((run) => run.t.trim())));
}

/** Bỏ xuống dòng thừa ở đầu, cuối khối (trình duyệt hay để <br> cuối). */
function trimRuns(runs: RichIntroRun[]): RichIntroRun[] {
  const out = [...runs];
  while (out.length && !out[0].t.trim()) out.shift();
  while (out.length && !out[out.length - 1].t.trim()) out.pop();
  return out;
}

/**
 * Trình soạn kiểu blog cho phần giới thiệu "About this supplier" (gói Premium/Pro): gõ trực tiếp,
 * thấy ngay tiêu đề phụ, gạch đầu dòng, chữ đậm. Chỉ ba định dạng này: không màu, cỡ chữ, link,
 * ảnh. Dán vào luôn thành chữ thường. Giá trị là chữ có dấu định dạng (lib/rich-intro), gửi kèm
 * biểu mẫu qua ô ẩn `name` khi có.
 */
export function RichIntroEditor({ value, onChange, name, max, placeholder, copy, minHeight = 180, variant = "boxed" }: {
  /**
   * "inline": sửa ngay trên trang (trình thiết kế): không khung, cùng cỡ chữ với trang, thanh định
   * dạng nổi chỉ hiện khi đang soạn.
   */
  variant?: "boxed" | "inline";
  value: string;
  onChange?: (value: string) => void;
  name?: string;
  max: number;
  placeholder?: string;
  copy: RichIntroEditorCopy;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(value);
  const [empty, setEmpty] = useState(!value.trim());
  const [active, setActive] = useState<{ h3: boolean; ul: boolean; b: boolean }>({ h3: false, ul: false, b: false });
  const own = useRef(value);

  // Nạp nội dung ban đầu (và khi nơi gọi đổi giá trị từ bên ngoài, ví dụ Hủy).
  useEffect(() => {
    if (!ref.current || value === own.current && ref.current.innerHTML) return;
    ref.current.innerHTML = toHtml(value);
    own.current = value; setText(value); setEmpty(!value.trim());
  }, [value]);

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    const next = fromDom(el);
    own.current = next; setText(next); setEmpty(!next.trim());
    onChange?.(next);
  };
  const refreshActive = () => {
    const selection = window.getSelection();
    let node: Node | null = selection?.anchorNode ?? null;
    let h3 = false, ul = false;
    while (node && node !== ref.current) {
      if (node instanceof HTMLElement) { if (/^H[1-6]$/.test(node.tagName)) h3 = true; if (node.tagName === "UL" || node.tagName === "OL") ul = true; }
      node = node.parentNode;
    }
    setActive({ h3, ul, b: document.queryCommandState("bold") });
  };
  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    sync(); refreshActive();
  };

  const button = (on: boolean) => `inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${on ? "bg-brand-700 text-white" : "text-ink-700 hover:bg-ink-100"}`;
  const inline = variant === "inline";
  const [focused, setFocused] = useState(false);
  const content = inline
    ? "px-3 py-2 text-[15.5px] leading-8 text-ink-700 [&_h3]:mb-1 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:tracking-tight [&_h3]:text-ink-900 [&_li]:my-1 [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-ink-900 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:pl-1 [&_ul]:marker:text-[var(--sf-accent)]"
    : "px-3 py-2.5 text-sm leading-6 text-ink-800 [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-[15px] [&_h3]:font-bold [&_h3]:text-ink-900 [&_li]:my-0.5 [&_p]:my-1.5 [&_strong]:font-bold [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5";
  return <div onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    className={inline
      ? `relative rounded-xl outline-dashed outline-1 outline-offset-4 transition ${focused ? "bg-white outline-2 outline-solid outline-brand-500" : "outline-transparent hover:outline-brand-300"}`
      : "rounded-lg border border-ink-200 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100"}>
    <div role="toolbar" aria-label="Formatting" className={inline
      // Nổi phía trên ô, không chiếm chỗ: ẩn hiện không làm xô lệch nút bên dưới.
      ? `absolute bottom-full left-0 z-20 mb-2 flex w-max items-center whitespace-nowrap gap-1 rounded-lg border border-ink-200 bg-white px-1.5 py-1 shadow-md transition ${focused ? "" : "pointer-events-none invisible opacity-0"}`
      : "flex flex-wrap items-center gap-1 border-b border-ink-100 px-1.5 py-1"}>
      <button type="button" className={button(!active.h3 && !active.ul)} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (active.ul) run("insertUnorderedList"); run("formatBlock", "p"); }}>
        <Pilcrow className="size-3.5" aria-hidden="true" />{copy.paragraph}</button>
      <button type="button" className={button(active.h3)} aria-pressed={active.h3} onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (active.ul) run("insertUnorderedList"); run("formatBlock", active.h3 ? "p" : "h3"); }}>
        <Heading3 className="size-3.5" aria-hidden="true" />{copy.heading}</button>
      <button type="button" className={button(active.ul)} aria-pressed={active.ul} onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (active.h3) run("formatBlock", "p"); run("insertUnorderedList"); }}>
        <List className="size-3.5" aria-hidden="true" />{copy.list}</button>
      <button type="button" className={button(active.b)} aria-pressed={active.b} onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")}>
        <Bold className="size-3.5" aria-hidden="true" />{copy.bold}</button>
    </div>
    <div className="relative">
      {empty && placeholder && <p className={`pointer-events-none absolute left-3 ${inline ? "top-2 text-[15.5px] leading-8" : "top-2.5 text-sm"} text-ink-400`}>{placeholder}</p>}
      <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={placeholder}
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onInput={sync} onKeyUp={refreshActive} onMouseUp={refreshActive}
        onPaste={(event) => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); }}
        onDrop={(event) => event.preventDefault()}
        style={{ minHeight }}
        className={`max-w-none outline-none ${content}`} />
    </div>
    {<p className={`${inline ? `px-3 pb-1 ${focused || text.length > max ? "" : "invisible"}` : "border-t border-ink-100 px-3 py-1"} text-[11px] ${text.length > max ? "font-semibold text-rose-700" : "text-ink-400"}`}>
      {copy.chars.replace("{count}", String(text.length)).replace("{max}", String(max))}
    </p>}
    {name && <input type="hidden" name={name} value={text} />}
  </div>;
}

