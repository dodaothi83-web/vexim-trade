import { hasPermission } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/types";

/**
 * Single-person verification workflow: a staff member who can both inspect and
 * approve may finish their own submitted review after explicitly confirming the
 * evidence re-check. AI remains advisory and never approves by itself.
 *
 * Admin and review lead can complete their own inspection after confirmation.
 */
export function canSelfApproveVerification(role: UserRole | null | undefined): boolean {
  return hasPermission(role, "verifications.inspect") && hasPermission(role, "verifications.approve");
}
