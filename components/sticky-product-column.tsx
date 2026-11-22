"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { productColumnStickyTop } from "@/lib/public/product-column-sticky";

/**
 * A desktop-only sticky grid panel. The parent grid owns the release boundary,
 * so no scroll listener or duplicated layout state is needed.
 */
export function StickyProductColumn({ children }: { children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setTop(desktop.matches ? productColumnStickyTop(panel.offsetHeight, window.innerHeight) : null);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    // ResizeObserver tự gọi update() lần đầu sau khi trình duyệt dàn trang xong; đo ngay trong
    // effect (offsetHeight) sẽ ép dàn trang đồng bộ lúc tải trang (PageSpeed: "forced reflow").
    if (observer) observer.observe(panel);
    else update();
    window.addEventListener("resize", update);
    desktop.addEventListener("change", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      desktop.removeEventListener("change", update);
    };
  }, []);

  return <div ref={panelRef} className="min-w-0 lg:sticky lg:self-start" style={top === null ? undefined : { top }}>
    {children}
  </div>;
}
