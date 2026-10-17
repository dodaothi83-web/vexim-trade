import type { Supplier } from "@/lib/types";
import type { DataStore } from "@/lib/db/types";

/** Missing migration/old records cannot accidentally receive access. */
export function portalApproved(supplier: Pick<Supplier, "onboarding_status">): boolean {
  return supplier.onboarding_status === "approved";
}

export function canSubmitProfile(supplier: Pick<Supplier, "onboarding_status">): boolean {
  return supplier.onboarding_status === "not_started" || supplier.onboarding_status === "changes_requested";
}

/** Staff-managed legacy suppliers without portal accounts can still receive RFQs by email. */
export async function canInviteSupplier(supplier: Supplier, store: DataStore): Promise<boolean> {
  if (portalApproved(supplier)) return true;
  if (supplier.onboarding_status === "pending" || supplier.onboarding_status === "changes_requested") return false;
  // not_started includes both newly registered accounts and staff-created supplier records.
  const user = supplier.email ? await store.getUserByEmail(supplier.email) : null;
  return !(user?.role === "supplier" && user.supplier_id === supplier.id);
}
