import "server-only";

import { getStore } from "@/lib/db";
import type { BuyerWithSupplier, Supplier, SupplierProduct } from "@/lib/types";
import { isOwnedBy } from "@/lib/auth/scope";

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

/** scope: tên người phụ trách cần lọc (null = tất cả). Xem lib/auth/scope.ts */
export async function listBuyersWithSupplier(scope: string | null = null): Promise<BuyerWithSupplier[]> {
  const store = getStore();
  const [buyers, suppliers] = await Promise.all([
    store.listBuyers(),
    store.listSuppliers(),
  ]);
  const map = new Map<string, Supplier>(suppliers.map((s) => [s.id, s]));

  return buyers.filter((b) => isOwnedBy(b.owner, scope)).map((b) => {
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

/** Danh sách tên nhân viên kinh doanh đang hoạt động, dùng cho ô chọn người phụ trách. */
export async function listSalesOwnerNames(): Promise<string[]> {
  const users = await getStore().listUsers();
  const names = users
    .filter((u) => u.role === "sale" && u.is_active && (u.name ?? "").trim())
    .map((u) => (u.name as string).trim());
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "vi"));
}

export async function getBuyerWithSupplier(id: string, scope: string | null = null) {
  const all = await listBuyersWithSupplier(scope);
  return all.find((b) => b.id === id) ?? null;
}
