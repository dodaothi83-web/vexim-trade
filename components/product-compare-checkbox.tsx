"use client";

import { useProductComparison } from "@/components/product-comparison-provider";
import type { ProductComparisonSelection } from "@/lib/public/product-comparison";

/**
 * Compact Alibaba-style image-corner checkbox:
 * - 40×40px (`size-10`) transparent hit target for comfortable touch/click
 * - 21×21px (`size-[21px]`) single visual box, thin border, semi-transparent white fill, no drop shadow
 * Always rendered as a sibling of the product link, never nested inside it.
 */
export function ProductCompareCheckbox({
  product,
  className = "absolute right-0.5 top-0.5",
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
      className={`${className} group/cmp z-20 flex size-10 items-center justify-center select-none ${
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
      <span
        aria-hidden="true"
        className={`flex size-[21px] items-center justify-center rounded-[5px] border transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-1 ${
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
