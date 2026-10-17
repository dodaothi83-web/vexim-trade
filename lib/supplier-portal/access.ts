import "server-only";

import { getStore } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { ownsDocumentReview } from "./policy";

/** Re-read the DB-bound supplier_id for every request; never trust form IDs or the signed cookie alone. */
export async function supplierPortalAccess() {
  const session = await getSession();
  if (!session || session.role !== "supplier") return null;
  const store = getStore();
  const user = await store.getUser(session.uid);
  if (!user || user.role !== "supplier" || !user.is_active || !user.supplier_id ||
      user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) return null;
  const supplier = await store.getSupplier(user.supplier_id);
  if (!supplier) return null;
  const reviews = await store.listVerifications(supplier.id);
  const review = reviews.find((v) => ownsDocumentReview(user, v)) ?? null;
  return { store, user, supplier, review, reviews };
}
