import "server-only";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { ownsDocumentReview } from "./policy";

/** Account identity may exist before the first business profile; never trust form IDs or the signed cookie alone. */
export async function supplierAccountAccess() {
  const session = await getSession();
  if (!session || session.role !== "supplier") return null;
  const store = getStore();
  const user = await store.getUser(session.uid);
  if (!user || user.role !== "supplier" || !user.is_active ||
      user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) return null;
  return { store, user };
}

/** All protected portal actions still require a linked supplier page. */
export async function supplierPortalAccess() {
  const account = await supplierAccountAccess();
  const supplierId = account?.user.supplier_id;
  if (!account || !supplierId) return null;
  const { store, user } = account;
  const supplier = await store.getSupplier(supplierId);
  if (!supplier) return null;
  const reviews = await store.listVerifications(supplier.id);
  const review = reviews.find((v) => ownsDocumentReview(user, v)) ?? null;
  return { store, user, supplier, review, reviews };
}
