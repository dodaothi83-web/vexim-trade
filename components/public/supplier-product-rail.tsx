"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, type ReactNode } from "react";

/**
 * Thanh trượt sản phẩm trang nhà cung cấp: máy tính thấy 3 thẻ trọn và một phần thẻ thứ 4 (báo còn
 * sản phẩm để kéo), máy tính bảng 2 thẻ và một phần; điện thoại xếp dọc. Kéo ngang tự do; nút
 * mũi tên trượt đúng một khung.
 */
export function SupplierProductRail({ children, productCount, id = "supplier-product-rail", label = "Supplier products" }: {
  children: ReactNode; productCount: number; id?: string; label?: string;
}) {
  const railRef = useRef<HTMLUListElement>(null);
  const scroll = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const gap = Number.parseFloat(window.getComputedStyle(rail).columnGap) || 0;
    rail.scrollBy({ left: direction * (rail.clientWidth + gap), behavior: "smooth" });
  };
  const arrow = "inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-sm transition hover:border-brand-300 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";

  return <div className="mt-3">
    {productCount > 3 && <div className="mb-3 hidden items-center gap-2 sm:flex">
      <p className="mr-auto text-xs text-ink-500">Scroll to see all {productCount} products.</p>
      <button type="button" aria-label="Show previous products" aria-controls={id} onClick={() => scroll(-1)} className={arrow}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" aria-label="Show next products" aria-controls={id} onClick={() => scroll(1)} className={arrow}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
    </div>}
    <ul id={id} ref={railRef} aria-label={label} tabIndex={productCount > 2 ? 0 : undefined}
      className="grid grid-cols-1 items-stretch gap-3 sm:flex sm:snap-x sm:snap-mandatory sm:gap-4 sm:overflow-x-auto sm:overscroll-x-contain sm:scroll-smooth sm:pb-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700">
      {children}
    </ul>
  </div>;
}
