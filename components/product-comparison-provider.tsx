"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  MAX_PRODUCT_COMPARISONS,
  normalizeProductComparisonSelection,
  toggleProductComparisonSelection,
  type ProductComparisonSelection,
  type ProductComparisonToggleResult,
} from "@/lib/public/product-comparison";

const STORAGE_KEY = "vexim:product-comparison:v1";

interface ProductComparisonContextValue {
  items: ProductComparisonSelection[];
  ready: boolean;
  notice: string | null;
  toggleProduct: (product: ProductComparisonSelection) => ProductComparisonToggleResult;
  removeProduct: (productId: string) => void;
  replaceProducts: (products: readonly ProductComparisonSelection[]) => void;
  clearProducts: () => void;
}

const ProductComparisonContext = createContext<ProductComparisonContextValue | null>(null);

export function useProductComparison(): ProductComparisonContextValue {
  const context = useContext(ProductComparisonContext);
  if (!context) throw new Error("useProductComparison must be used inside ProductComparisonProvider");
  return context;
}

export function ProductComparisonProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ProductComparisonSelection[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const itemsRef = useRef<ProductComparisonSelection[]>([]);

  const commit = useCallback((next: readonly ProductComparisonSelection[]) => {
    const normalized = normalizeProductComparisonSelection(next);
    itemsRef.current = normalized;
    setItems(normalized);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) commit(normalizeProductComparisonSelection(JSON.parse(saved)));
    } catch {
      // A blocked or malformed local store must not prevent product browsing.
    } finally {
      setReady(true);
    }
  }, [commit]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The in-memory comparison still works when storage is unavailable.
    }
  }, [items, ready]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      try {
        commit(event.newValue ? JSON.parse(event.newValue) : []);
      } catch {
        // Ignore malformed changes from another tab and retain this tab's list.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [commit]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const toggleProduct = useCallback((product: ProductComparisonSelection): ProductComparisonToggleResult => {
    const next = toggleProductComparisonSelection(itemsRef.current, product);
    if (next.result === "limit") {
      setNotice(`You can compare up to ${MAX_PRODUCT_COMPARISONS} products. Remove a selected product before adding another.`);
      return next.result;
    }
    if (next.result === "invalid") {
      setNotice("This product cannot be added to the comparison.");
      return next.result;
    }
    setNotice(null);
    commit(next.items);
    return next.result;
  }, [commit]);

  const removeProduct = useCallback((productId: string) => {
    setNotice(null);
    commit(itemsRef.current.filter((item) => item.id !== productId));
  }, [commit]);

  const replaceProducts = useCallback((products: readonly ProductComparisonSelection[]) => {
    setNotice(null);
    const next = normalizeProductComparisonSelection(products);
    const current = itemsRef.current;
    if (current.length === next.length && current.every((item, index) =>
      item.id === next[index]?.id && item.name === next[index]?.name && item.imagePath === next[index]?.imagePath && item.categorySlug === next[index]?.categorySlug)) return;
    commit(next);
  }, [commit]);

  const clearProducts = useCallback(() => {
    setNotice(null);
    commit([]);
  }, [commit]);

  const value = useMemo<ProductComparisonContextValue>(() => ({
    items,
    ready,
    notice,
    toggleProduct,
    removeProduct,
    replaceProducts,
    clearProducts,
  }), [items, ready, notice, toggleProduct, removeProduct, replaceProducts, clearProducts]);

  return <ProductComparisonContext.Provider value={value}>{children}</ProductComparisonContext.Provider>;
}
