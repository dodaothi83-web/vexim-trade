"use client";

import { useProductComparison } from "@/components/product-comparison-provider";
import type { ProductComparisonSelection } from "@/lib/public/product-comparison";

/** Image-corner comparison control expands on card hover or keyboard focus.
 * Remains a sibling of the product link, with a compact 32px-high control inset from the image edge.
 */
export function ProductCompareCheckbox({
  product,
  className = "absolute right-2 top-2",
}: {
  product: ProductComparisonSelection;
  className?: string;
}) {
  const { items, ready, toggleProduct } = useProductComparison();
  const selected = items.some((item) => item.id === product.id);
  const action = selected ? `Remove ${product.name} from comparison` : `Add ${product.name} to comparison`;

  return (
    <label
      title={selected ? "Remove from comparison" : "Compare product"}
      className={`${className} group/cmp z-20 flex min-h-8 min-w-10 items-center justify-end gap-1.5 rounded-full px-2 select-none transition-colors hover:bg-white/95 focus-within:bg-white/95 group-hover/card:bg-white/95 group-focus-within/card:bg-white/95 [@media(hover:none)]:bg-white/95 ${
        ready ? "cursor-pointer" : "cursor-wait opacity-70"
      }`}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={!ready}
        onChange={() => toggleProduct(product)}
        aria-label={action}
        className="peer sr-only"
      />
      <span aria-hidden="true" className={`hidden sm:inline overflow-hidden whitespace-nowrap text-[11px] font-semibold text-ink-800 transition-[max-width,opacity] ${selected ? "max-w-20 opacity-100" : "max-w-0 opacity-0 group-hover/card:max-w-20 group-hover/card:opacity-100 group-hover/cmp:max-w-20 group-hover/cmp:opacity-100 peer-focus-visible:max-w-20 peer-focus-visible:opacity-100 [@media(hover:none)]:max-w-20 [@media(hover:none)]:opacity-100"}`}>Compare</span>
      <span
        aria-hidden="true"
        className={`flex size-[21px] shrink-0 items-center justify-center rounded-[5px] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-1 ${
          selected
            ? "border-brand-700 bg-brand-700 text-white"
            : "border-ink-300/80 bg-white/80 group-hover/cmp:border-brand-600 group-hover/cmp:bg-white/95"
        }`}
      >
        {selected && (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="size-3.5"
            aria-hidden="true"
          >
            <path
              d="M3.5 8.25 6.5 11.25 12.5 4.75"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="sr-only">{action}</span>
    </label>
  );
}
