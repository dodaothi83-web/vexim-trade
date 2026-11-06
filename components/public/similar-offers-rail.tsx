"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * Danh sách "Similar offers". Máy tính (lg trở lên): một hàng trượt ngang, 5 thẻ mỗi lượt,
 * hai nút mũi tên ở góc phải tiêu đề. Điện thoại và máy tính bảng: giữ lưới như cũ, tối đa 4 thẻ.
 */
export function SimilarOffersRail({ title, titleId, children }: { title: string; titleId: string; children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const items = Children.toArray(children);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [update]);

  // Mỗi lần bấm trượt đúng một trang (5 thẻ).
  const slide = (direction: -1 | 1) => track.current?.scrollBy({ left: direction * track.current.clientWidth, behavior: "smooth" });
  const arrow = "flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-sm transition hover:border-brand-300 hover:text-brand-800 disabled:cursor-default disabled:opacity-35 disabled:hover:border-ink-200 disabled:hover:text-ink-700";

  return <>
    <div className="flex items-center justify-between gap-3">
      <h2 id={titleId} className="text-2xl font-black text-ink-900">{title}</h2>
      {!(edges.start && edges.end) && <div className="hidden gap-2 lg:flex">
        <button type="button" onClick={() => slide(-1)} disabled={edges.start} aria-label="Previous offers" className={arrow}><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" onClick={() => slide(1)} disabled={edges.end} aria-label="Next offers" className={arrow}><ChevronRight className="h-5 w-5" /></button>
      </div>}
    </div>
    <ul ref={track} aria-labelledby={titleId}
      className="mt-5 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:flex lg:snap-x lg:snap-mandatory lg:overflow-x-auto lg:scroll-smooth lg:pb-2 lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
      {items.map((child, i) => <li key={i} className={cx("min-w-0 lg:w-[calc((100%-4rem)/5)] lg:shrink-0 lg:snap-start", i >= 4 && "hidden lg:block")}>{child}</li>)}
    </ul>
  </>;
}
