"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, X } from "lucide-react";

import { useProductComparison } from "@/components/product-comparison-provider";
import {
  productComparisonHref,
  type ProductComparisonSelection,
} from "@/lib/public/product-comparison";

/** Keep the persisted tray and a shared comparison URL on the same selection. */
export function ProductComparisonSync({ products, fromUrl }: {
  products: ProductComparisonSelection[];
  fromUrl: boolean;
}) {
  const { items, ready, replaceProducts } = useProductComparison();
  const router = useRouter();
  const signature = products.map((product) => product.id).join(",");
  const localSignature = items.map((item) => item.id).join(",");

  // URL -> selection is intentionally independent of localSignature. Otherwise a
  // remove/clear would reapply the old server props while router.replace is pending.
  useEffect(() => {
    if (!ready || !fromUrl) return;
    replaceProducts(products);
  // The signature captures URL changes without resyncing on object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fromUrl, signature, replaceProducts]);

  // On an empty compare URL, a selection made in the tray can open the table.
  // Once a product query exists, only the URL effect above owns reconciliation.
  useEffect(() => {
    if (!ready || fromUrl || items.length < 2) return;
    router.replace(productComparisonHref(items.map((item) => item.id)), { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fromUrl, localSignature, router]);

  return null;
}

export function RemoveComparedProduct({ product, products }: {
  product: ProductComparisonSelection;
  products: ProductComparisonSelection[];
}) {
  const { replaceProducts } = useProductComparison();
  const router = useRouter();
  const remove = () => {
    const next = products.filter((item) => item.id !== product.id);
    replaceProducts(next);
    router.replace(productComparisonHref(next.map((item) => item.id)), { scroll: false });
  };
  return (
    <button type="button" onClick={remove} aria-label={`Remove ${product.name} from comparison`} className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-400 hover:border-brand-300 hover:text-brand-800">
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}

export function CopyComparisonLink({ productIds }: { productIds: string[] }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timeout = window.setTimeout(() => setState("idle"), 3000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  const copy = async () => {
    const href = productComparisonHref(productIds);
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-xs font-bold text-ink-700 hover:border-brand-400 hover:text-brand-800">
        {state === "copied" ? <Check className="size-4 text-brand-700" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {state === "copied" ? "Link copied" : "Copy comparison link"}
      </button>
      {state === "failed" && <p role="alert" className="text-xs font-semibold text-amber-900">Copy failed. Copy the URL from your address bar.</p>}
    </div>
  );
}
