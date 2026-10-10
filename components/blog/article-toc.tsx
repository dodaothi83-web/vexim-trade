"use client";

import { useEffect, useState } from "react";

/**
 * Mục lục bài viết. Làm nổi bật mục đang đọc bằng IntersectionObserver.
 * Dùng cho cả sidebar (desktop) và khối thu gọn (điện thoại).
 */
export function ArticleToc({ headings }: { headings: { id: string; text: string; level: number }[] }) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") return;

    // Mục được coi là đang đọc khi nó nằm trong vùng trên của màn hình
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [headings]);

  return (
    <ul className="space-y-1.5 text-[14px] leading-snug">
      {headings.map((h) => {
        const active = h.id === activeId;
        return (
          <li key={h.id} style={{ paddingLeft: `${Math.max(0, h.level - 2) * 12}px` }}>
            <a
              href={`#${h.id}`}
              aria-current={active ? "location" : undefined}
              className={
                active
                  ? "font-semibold text-brand-700"
                  : "text-ink-600 transition hover:text-ink-900"
              }
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
