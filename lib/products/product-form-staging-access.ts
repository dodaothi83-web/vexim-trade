import "server-only";

/** Only exact project origins are accepted; a Preview must never write production. */
function matchesProject(ref: string): boolean {
  const value = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === `${ref}.supabase.co` &&
      !url.username && !url.password && !url.port && (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash;
  } catch { return false; }
}

export function isSyntheticProductFormStaging(): boolean {
  return process.env.VEXIM_DEPLOY_ENV === "staging" && matchesProject("vqyekpritfobxkrlisan");
}

/**
 * Explicit release switch. Keep false until production schema, permissions and
 * buyer cutover have been reviewed. Vercel previews can never use this path,
 * even if their environment variables accidentally point at production.
 */
export function isProductionProductFormEnabled(): boolean {
  return process.env.VERCEL_ENV === "production" && process.env.VEXIM_DEPLOY_ENV !== "staging" &&
    process.env.VEXIM_PRODUCT_FORM_PRODUCTION === "true" && matchesProject("axvphurlpczysvzabgkm");
}

export function isProductFormEnabled(): boolean {
  return isSyntheticProductFormStaging() || isProductionProductFormEnabled();
}

/** Submissions/approval require the matching buyer projection to be active. */
export function isProductFormBuyerEnabled(): boolean {
  return isProductionProductFormEnabled() ||
    (isSyntheticProductFormStaging() && process.env.VEXIM_QUANTITY_BUYER_PREVIEW === "true");
}

/** Preserve the old opt-in preview independently of the new production switch. */
export function isQuantityCatalogPreviewEnabled(): boolean {
  return process.env.VEXIM_QUANTITY_BUYER_PREVIEW === "true" || isProductionProductFormEnabled();
}
