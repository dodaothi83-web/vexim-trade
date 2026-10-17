/**
 * Temporary single-reviewer mode: admin may approve their own submitted audit.
 * Set VERIFICATION_REQUIRE_TWO_PERSON_REVIEW=true to restore independent review
 * in the app after staffing permits. The database constraint is migrated separately.
 */
export function requireSecondVerificationReviewer(): boolean {
  return process.env.VERIFICATION_REQUIRE_TWO_PERSON_REVIEW === "true";
}
