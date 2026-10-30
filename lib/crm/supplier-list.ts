import type { AuditLogEntry, Buyer, Supplier } from "@/lib/types";
import { getStage } from "@/lib/pipeline";

export type SupplierOrderUsage = Record<string, { total: number; active: number }>;

/** Count every linked order once, while only open pipeline stages remain active. */
export function buildSupplierOrderUsage(buyers: Pick<Buyer, "supplier_id" | "stage">[]): SupplierOrderUsage {
  const usage: SupplierOrderUsage = {};
  for (const buyer of buyers) {
    if (!buyer.supplier_id) continue;
    usage[buyer.supplier_id] ??= { total: 0, active: 0 };
    usage[buyer.supplier_id].total += 1;
    if (!getStage(buyer.stage).terminal) usage[buyer.supplier_id].active += 1;
  }
  return usage;
}

/** Use the latest audit event matching each supplier's current onboarding decision. */
export function buildSupplierReviewTimes(
  suppliers: Pick<Supplier, "id" | "onboarding_status">[],
  decisions: Pick<AuditLogEntry, "entity_id" | "action" | "created_at">[],
): Record<string, string> {
  const expectedAction = new Map(suppliers.map((supplier) => [
    supplier.id,
    supplier.onboarding_status === "approved" ? "supplier.portal_access_approved"
      : supplier.onboarding_status === "changes_requested" ? "supplier.profile_changes_requested" : null,
  ] as const));
  const reviewedAt: Record<string, string> = {};
  for (const decision of decisions) {
    if (decision.action !== expectedAction.get(decision.entity_id)) continue;
    if (!reviewedAt[decision.entity_id] || decision.created_at > reviewedAt[decision.entity_id]) {
      reviewedAt[decision.entity_id] = decision.created_at;
    }
  }
  return reviewedAt;
}
