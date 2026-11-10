import type { Supplier } from "@/lib/types";
import type { DataStore } from "@/lib/db/types";

/** Missing migration/old records cannot accidentally receive access. */
export function portalApproved(supplier: Pick<Supplier, "onboarding_status">): boolean {
  return supplier.onboarding_status === "approved";
}

export function canSubmitProfile(supplier: Pick<Supplier, "onboarding_status">): boolean {
  return supplier.onboarding_status === "not_started" || supplier.onboarding_status === "changes_requested";
}

/** A valid, approved, active supplier portal is the only RFQ delivery channel.
 * Supplier email is an optional link-only notice, never a fallback invitation.
 */
export async function canInviteSupplier(supplier: Supplier, store: DataStore): Promise<boolean> {
  if (supplier.status !== "published" || !portalApproved(supplier)) return false;
  const user = await store.getUserBySupplierId(supplier.id);
  return !!user && user.role === "supplier" && user.supplier_id === supplier.id && user.is_active;
}
