"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";

/** Desktop shows five cards at a time; native horizontal scrolling remains free between button steps. */
export function SupplierProductRail({ children, productCount }: { children: ReactNode; productCount: number }) {
  const railRef = useRef<HTMLUListElement>(null);
  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const gap = Number.parseFloat(window.getComputedStyle(rail).columnGap) || 0;
    rail.scrollBy({ left: direction * (rail.clientWidth + gap), behavior: "smooth" });
  };

  return <div className="mt-5">
    {productCount > 5 && <div className="mb-3 hidden items-center gap-2 lg:flex">
      <p className="mr-auto text-xs text-ink-500">Scroll horizontally to explore all {productCount} products.</p>
      <button type="button" aria-label="Show previous products" aria-controls="supplier-product-rail"
        onClick={() => scroll(-1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-sm transition hover:border-brand-300 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Show next products" aria-controls="supplier-product-rail"
        onClick={() => scroll(1)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-sm transition hover:border-brand-300 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>}
    <ul id="supplier-product-rail" ref={railRef} aria-label="Supplier products" tabIndex={productCount > 5 ? 0 : undefined}
      className="grid grid-cols-1 items-stretch gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:flex lg:scroll-smooth lg:overflow-x-auto lg:overscroll-x-contain lg:pb-3">
      {children}
    </ul>
  </div>;
}
