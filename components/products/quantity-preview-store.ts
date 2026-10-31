"use client";

import { useSyncExternalStore } from "react";

import type { QuantityPricingInput, QuantityPricingPolicy } from "@/lib/products/quantity-pricing";

/** Dữ liệu thẻ "Người mua sẽ thấy" khi nó nằm ở cột phải, tách khỏi form đang nhập. */
export type QuantityPreviewSnapshot = {
  value: QuantityPricingInput;
  standardGrades: string[];
  policy: QuantityPricingPolicy;
  buyerPriceUnit: "kg" | "mt";
  pricePubliclyVisible: boolean;
};

let current: QuantityPreviewSnapshot | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Gọi khi form đổi; truyền null khi form rời trang để cột phải quay lại dữ liệu đã lưu. */
export function publishQuantityPreview(snapshot: QuantityPreviewSnapshot | null) {
  current = snapshot;
  emit();
}

export function useQuantityPreview(initial: QuantityPreviewSnapshot | null): QuantityPreviewSnapshot | null {
  return useSyncExternalStore(subscribe, () => current, () => initial);
}
