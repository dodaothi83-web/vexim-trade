"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Đoạn chữ dài: hiện vài dòng đầu kèm "Read more" để khối giới thiệu gọn, sang. Chữ đầy đủ vẫn
 * nằm trong trang (chỉ bị cắt bằng CSS) nên máy tìm kiếm và người đọc màn hình vẫn đọc được.
 */
export function ExpandableText({ text, lines = 7, className = "" }: { text: string; lines?: number; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 4);
  }, [text]);
  return <div>
    <p ref={ref} className={`whitespace-pre-line break-words ${className}`}
      style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{text}</p>
    {(overflow || open) && <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
      className="mt-2 text-sm font-semibold text-[var(--sf-dark)] underline underline-offset-4 hover:text-[var(--sf-accent)]">
      {open ? "Show less" : "Read more"}
    </button>}
  </div>;
}
