import type { L2VerificationScope, SupplierType } from "@/lib/types";

/** New L2 cases follow the registered type. Missing/unknown types need staff review. */
export function l2ScopeForSupplier(type: SupplierType | null | undefined): L2VerificationScope | null {
  if (type === "trading") return "partner_contract";
  if (type === "manufacturer" || type === "cooperative") return "factory";
  return null;
}

/** A null historical scope retains the pre-existing factory-review meaning. */
export function effectiveL2Scope(scope: L2VerificationScope | null | undefined): L2VerificationScope {
  return scope === "partner_contract" ? "partner_contract" : "factory";
}

export function isPartnerL2(row: { target_level: number; l2_scope?: L2VerificationScope | null }): boolean {
  return row.target_level === 2 && row.l2_scope === "partner_contract";
}

/** A scope snapshot must match the current legal entity's registered type to continue a new decision. */
export function l2ScopeMatchesSupplier(
  row: { target_level: number; l2_scope?: L2VerificationScope | null },
  type: SupplierType | null | undefined,
): boolean {
  if (row.target_level !== 2) return true;
  const expected = l2ScopeForSupplier(type);
  return expected !== null && expected === effectiveL2Scope(row.l2_scope);
}

/** L2 has two independent scopes; other levels remain single-scope. */
export function sameVerificationScope(
  a: { target_level: number; l2_scope?: L2VerificationScope | null },
  b: { target_level: number; l2_scope?: L2VerificationScope | null },
): boolean {
  return a.target_level === b.target_level && (a.target_level !== 2 || effectiveL2Scope(a.l2_scope) === effectiveL2Scope(b.l2_scope));
}
