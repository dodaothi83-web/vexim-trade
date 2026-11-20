import { Fragment } from "react";

import { parseRichIntro, type RichIntroRun } from "@/lib/rich-intro";

/**
 * Phần giới thiệu có định dạng trên trang Premium/Pro: HTML ngữ nghĩa (h3, ul, strong) để người
 * mua đọc dễ và máy tìm kiếm hiểu cấu trúc. Chữ đã lọc thông tin liên hệ ở nơi gọi.
 */
export function RichIntro({ text, className = "" }: { text: string; className?: string }) {
  const nodes = parseRichIntro(text);
  const runs = (list: RichIntroRun[]) => list.map((run, i) => run.b
    ? <strong key={i} className="font-semibold text-ink-900">{run.t}</strong>
    : <Fragment key={i}>{run.t}</Fragment>);
  const out: React.ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === "li") {
      const items: RichIntroRun[][] = [];
      while (i < nodes.length && nodes[i].kind === "li") { items.push(nodes[i].runs); i++; }
      i--;
      out.push(<ul key={i} className="my-3 list-disc space-y-1.5 pl-5 marker:text-[var(--sf-accent)]">
        {items.map((item, k) => <li key={k} className="pl-1">{runs(item)}</li>)}
      </ul>);
    } else if (node.kind === "h3") {
      out.push(<h3 key={i} className="mb-1 mt-6 text-lg font-bold tracking-tight text-ink-900 first:mt-0">{runs(node.runs)}</h3>);
    } else {
      out.push(<p key={i} className="my-3 whitespace-pre-line first:mt-0 last:mb-0">{runs(node.runs)}</p>);
    }
  }
  return <div className={`break-words ${className}`}>{out}</div>;
}
