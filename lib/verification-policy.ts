import { hasPermission } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types";

/**
 * Single-person verification workflow: a staff member who can both inspect and
 * approve may finish their own submitted review after explicitly confirming the
 * evidence re-check. AI remains advisory and never approves by itself.
 *
 * Reviewer remains available for an optional independent decision, but the
 * sourcing team no longer needs to wait for admin/reviewer capacity.
 */
export function canSelfApproveVerification(role: UserRole | null | undefined): boolean {
  return hasPermission(role, "verifications.inspect") && hasPermission(role, "verifications.approve");
}
