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
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(panel);
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
