"use client";

import { useMemo, useRef } from "react";
import { ProductFormSessionEditor } from "@/components/products/product-form-session-editor";
import { supplierProductFormOperations } from "@/app/supplier/portal/products/product-form-operations";
import type { ProductFormDraft } from "@/lib/products/product-form-model";
import type { ProductFormImage } from "@/lib/products/product-form-session";
import type { QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

type Props = {
  initialDraft: ProductFormDraft; productId: string | null; revision: number; images: ProductFormImage[];
  availableImages?: ProductFormImage[]; pending?: boolean; readOnly?: boolean;
  categories: CategoryProposalOption[]; policies: Record<string, QuantityPricingPolicy>;
};

/** Present only on the separate synthetic staging project until E2E is complete. */
export function SupplierProductFormStagingEditor(props: Props) {
  const operations = useMemo(() => supplierProductFormOperations(), []);
  const retainedId = useRef(props.productId);
  return <ProductFormSessionEditor initialDraft={props.initialDraft} initialProductId={props.productId}
    initialRevision={props.revision} initialImages={props.images} initialAvailableImages={props.availableImages}
    initialPending={props.pending} disabled={props.readOnly} categories={props.categories} policies={props.policies} operations={operations}
    onSessionChange={(state) => {
      if (!retainedId.current && state.productId) {
        retainedId.current = state.productId;
        // Keep the same live session during an upload; a route navigation here
        // would remount it mid-write. A refresh still reopens the saved draft.
        window.history.replaceState(window.history.state, "", `/supplier/portal/products/${encodeURIComponent(state.productId)}`);
      }
    }} />;
}
