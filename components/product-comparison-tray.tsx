"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ImageIcon, X } from "lucide-react";

import { useProductComparison } from "@/components/product-comparison-provider";
import {
  MAX_PRODUCT_COMPARISONS,
  productComparisonHref,
  type ProductComparisonSelection,
} from "@/lib/public/product-comparison";

function ProductComparisonTrayInner() {
  const { items, ready, notice, removeProduct, clearProducts } = useProductComparison();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  if (!ready || items.length === 0) return null;

  const supplierTable = pathname === "/compare" && searchParams.has("ids") && !searchParams.has("products");
  const syncUrl = (next: readonly ProductComparisonSelection[]) => {
    if (pathname !== "/compare" || supplierTable) return;
    router.replace(productComparisonHref(next.map((item) => item.id)), { scroll: false });
  };
  const remove = (productId: string) => {
    const next = items.filter((item) => item.id !== productId);
    removeProduct(productId);
    syncUrl(next);
  };
  const clear = () => {
    clearProducts();
    syncUrl([]);
  };
  const compareHref = productComparisonHref(items.map((item) => item.id));

  return (
    <>
      <div aria-hidden="true" className="h-60 sm:h-32" />
      <aside aria-label="Product comparison list" className="fixed inset-x-2 bottom-24 z-50 mx-auto max-h-[calc(100dvh-7rem)] max-w-5xl overflow-y-auto rounded-2xl border border-brand-200 bg-white p-3 shadow-2xl shadow-ink-950/20 sm:inset-x-3 sm:bottom-6 sm:max-h-none sm:p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex shrink-0 items-center justify-between gap-3 sm:block">
            <div>
              <p className="text-sm font-black text-ink-900">Compare products</p>
              <p className="mt-0.5 text-xs font-semibold text-brand-800">{items.length}/{MAX_PRODUCT_COMPARISONS} selected</p>
            </div>
            <button type="button" onClick={clear} className="min-h-9 px-2 text-xs font-bold text-ink-500 underline underline-offset-2 hover:text-ink-900 sm:mt-2">Clear all</button>
          </div>

          <ul className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto pb-1 sm:px-3" aria-label="Selected products">
            {items.map((item) => (
              <li key={item.id} className="flex w-56 max-w-[calc(100vw-4rem)] flex-none snap-start items-center gap-2 rounded-lg bg-ink-50 p-2 ring-1 ring-ink-100 sm:w-auto sm:min-w-0 sm:max-w-none sm:flex-1">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white text-ink-300 ring-1 ring-ink-100">
                  {item.imagePath ? <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/public-media/${item.imagePath}`} alt="" className="h-full w-full object-cover" />
                  </> : <ImageIcon className="size-4" aria-hidden="true" />}
                </span>
                <Link href={item.href} title={item.name} className="min-w-0 flex-1 truncate text-xs font-bold text-ink-800 hover:text-brand-700">{item.name}</Link>
                <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.name} from comparison`} className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-white hover:text-ink-900 sm:size-7">
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <div className="shrink-0 sm:w-48">
            {items.length >= 2 ? (
              <Link href={compareHref} className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white hover:bg-brand-800 sm:min-h-11 sm:py-2.5">
                Compare ({items.length}) <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <button type="button" disabled className="min-h-10 w-full cursor-not-allowed rounded-lg bg-ink-200 px-4 py-2 text-sm font-bold text-ink-500 sm:min-h-11 sm:py-2.5">Compare (1)</button>
            )}
            {items.length === 1 && <p className="mt-1.5 text-center text-[11px] font-medium text-ink-500">Select 1 more product</p>}
          </div>
        </div>
        {notice && <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950 ring-1 ring-amber-200">{notice}</p>}
      </aside>
    </>
  );
}

export function ProductComparisonTray() {
  return <Suspense fallback={null}><ProductComparisonTrayInner /></Suspense>;
}
