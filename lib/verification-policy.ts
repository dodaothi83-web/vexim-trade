/** All new verification approvals require a different human than the inspector.
 * Kept as a helper so evidence edit checks and the UI use the same rule. */
export function requireSecondVerificationReviewer(): boolean {
  return true;
}
