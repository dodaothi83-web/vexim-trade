"use client";

import { useProductComparison } from "@/components/product-comparison-provider";
import type { ProductComparisonSelection } from "@/lib/public/product-comparison";

/** Small image-corner checkbox. It is always a sibling of the product link, never nested inside it. */
export function ProductCompareCheckbox({ product, className = "absolute right-2 top-2" }: {
  product: ProductComparisonSelection;
  className?: string;
}) {
  const { items, ready, toggleProduct } = useProductComparison();
  const selected = items.some((item) => item.id === product.id);
  const action = selected ? `Remove ${product.name} from comparison` : `Add ${product.name} to comparison`;

  return (
    <label
      title={selected ? "Remove from comparison" : "Compare product"}
      className={`${className} z-20 flex size-9 cursor-pointer items-center justify-center rounded-lg border bg-white/95 shadow-sm backdrop-blur transition hover:border-brand-600 hover:bg-brand-50 ${selected ? "border-brand-700" : "border-ink-200"} ${ready ? "" : "cursor-wait opacity-70"}`}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={selected}
        disabled={!ready}
        onChange={() => toggleProduct(product)}
        aria-label={action}
        className="size-4 cursor-pointer accent-brand-700 disabled:cursor-wait"
      />
      <span className="sr-only">{action}</span>
    </label>
  );
}
