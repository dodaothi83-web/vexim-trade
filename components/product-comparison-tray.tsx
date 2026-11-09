"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronUp, ImageIcon, X } from "lucide-react";

import { useProductComparison } from "@/components/product-comparison-provider";
import { MAX_PRODUCT_COMPARISONS, productComparisonHref } from "@/lib/public/product-comparison";

function CompareAction({ href, count, mobile = false }: { href: string; count: number; mobile?: boolean }) {
  const classes = "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold lg:gap-2 lg:px-4 lg:text-sm";
  return count >= 2 ? (
    <Link href={href} className={`${classes} bg-brand-700 text-white hover:bg-brand-800`}>
      Compare ({count}) <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  ) : (
    <button type="button" disabled title="Select one more product to compare"
      className={`${classes} cursor-not-allowed bg-ink-200 text-ink-500`}>
      {mobile ? "Add 1 more" : "Compare (1)"}
    </button>
  );
}

function ProductComparisonTrayInner() {
  const { items, ready, notice, removeProduct, clearProducts } = useProductComparison();
  const pathname = usePathname();
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // The comparison page has its own table and remove controls. Keep the saved
  // selection for browsing later, but never cover either comparison mode.
  useEffect(() => { setMobileExpanded(false); }, [pathname]);
  // Deselecting from a product card can empty the tray without using Clear all.
  // The next selection should start compact, not reopen a stale expanded panel.
  useEffect(() => { if (items.length === 0) setMobileExpanded(false); }, [items.length]);
  if (!ready || items.length === 0 || pathname === "/compare") return null;

  const compareHref = productComparisonHref(items.map((item) => item.id));
  const remove = (productId: string) => {
    removeProduct(productId);
    if (items.length === 1) setMobileExpanded(false);
  };
  const clear = () => {
    clearProducts();
    setMobileExpanded(false);
  };

  return (
    <>
      <div aria-hidden="true" className="h-24 lg:h-32" />
      <aside aria-label="Product comparison list"
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] z-50 mx-auto flex max-h-[calc(100dvh-2rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-2xl shadow-ink-950/20 lg:bottom-6 lg:block lg:max-h-none lg:max-w-5xl lg:overflow-visible lg:p-4">
        <div className="order-3 flex shrink-0 items-center gap-2 p-2 lg:hidden">
          <button type="button" aria-controls="comparison-selected-products" aria-expanded={mobileExpanded}
            aria-label={`${mobileExpanded ? "Hide" : "Show"} ${items.length} selected products`}
            onClick={() => setMobileExpanded((expanded) => !expanded)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 text-left hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-brand-600">
            <span className="truncate text-xs font-black text-ink-900">Selected</span>
            <span className="shrink-0 text-xs font-bold text-brand-800">{items.length}/{MAX_PRODUCT_COMPARISONS}</span>
            <ChevronUp className={`ml-auto size-4 shrink-0 text-ink-500 transition-transform ${mobileExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          <div className="w-[8.5rem] shrink-0"><CompareAction href={compareHref} count={items.length} mobile /></div>
        </div>

        <div id="comparison-selected-products" className={`${mobileExpanded ? "flex" : "hidden"} order-1 min-h-0 flex-col gap-2 border-b border-ink-100 px-3 py-2 lg:flex lg:flex-row lg:items-center lg:gap-3 lg:border-0 lg:p-0`}>
          <div className="flex shrink-0 items-center justify-between gap-3 lg:block">
            <div>
              <p className="text-sm font-black text-ink-900">Compare products</p>
              <p className="mt-0.5 text-xs font-semibold text-brand-800">{items.length}/{MAX_PRODUCT_COMPARISONS} selected</p>
            </div>
            <button type="button" aria-label="Clear comparison selection" onClick={clear}
              className="min-h-11 px-2 text-xs font-bold text-ink-500 underline underline-offset-2 hover:text-ink-900 lg:mt-2 lg:min-h-9">Clear all</button>
          </div>

          <ul className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto lg:snap-x lg:flex-row lg:overflow-x-auto lg:overflow-y-hidden lg:pb-1 lg:px-3" aria-label="Selected products">
            {items.map((item) => (
              <li key={item.id} className="flex w-full flex-none items-center gap-2 rounded-lg bg-ink-50 p-1 ring-1 ring-ink-100 lg:w-auto lg:min-w-0 lg:flex-1 lg:snap-start lg:p-2">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white text-ink-300 ring-1 ring-ink-100">
                  {item.imagePath ? <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/public-media/${item.imagePath}`} alt="" className="h-full w-full object-cover" />
                  </> : <ImageIcon className="size-4" aria-hidden="true" />}
                </span>
                <Link href={item.href} target="_blank" rel="noopener noreferrer" title={item.name}
                  className="min-w-0 flex-1 line-clamp-2 text-xs font-bold leading-4 text-ink-800 hover:text-brand-700 lg:line-clamp-none lg:truncate">{item.name}</Link>
                <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.name} from comparison`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-white hover:text-ink-900 lg:size-7">
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden shrink-0 lg:block lg:w-48">
            <CompareAction href={compareHref} count={items.length} />
            {items.length === 1 && <p className="mt-1.5 text-center text-[11px] font-medium text-ink-500">Select 1 more product</p>}
          </div>
        </div>
        {notice && <p role="alert" className="order-2 mx-2 mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950 ring-1 ring-amber-200 lg:mx-0 lg:mt-3">{notice}</p>}
      </aside>
    </>
  );
}

export function ProductComparisonTray() {
  return <Suspense fallback={null}><ProductComparisonTrayInner /></Suspense>;
}
