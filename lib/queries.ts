import "server-only";

import { getStore } from "@/lib/db";
import type { BuyerWithSupplier, Supplier, SupplierProduct } from "@/lib/types";

export interface ProductWithSupplier extends SupplierProduct {
  supplier: Supplier | null;
}

export async function listProductsWithSupplier(): Promise<ProductWithSupplier[]> {
  const store = getStore();
  const [products, suppliers] = await Promise.all([
    store.listProducts(),
    store.listSuppliers(),
  ]);
  const map = new Map<string, Supplier>(suppliers.map((s) => [s.id, s]));
  return products.map((p) => ({
    ...p,
    supplier: p.supplier_id ? (map.get(p.supplier_id) ?? null) : null,
  }));
}

export async function listBuyersWithSupplier(): Promise<BuyerWithSupplier[]> {
  const store = getStore();
  const [buyers, suppliers] = await Promise.all([
    store.listBuyers(),
    store.listSuppliers(),
  ]);
  const map = new Map<string, Supplier>(suppliers.map((s) => [s.id, s]));

  return buyers.map((b) => {
    const sup = b.supplier_id ? map.get(b.supplier_id) ?? null : null;
    return {
      ...b,
      supplier: sup
        ? {
            id: sup.id,
            name: sup.name,
            email: sup.email,
            phone: sup.phone,
            contact_name: sup.contact_name,
          }
        : null,
    };
  });
}

export async function getBuyerWithSupplier(id: string) {
  const all = await listBuyersWithSupplier();
  return all.find((b) => b.id === id) ?? null;
}
