import "server-only";

/**
 * Temporary safety boundary while the replacement workflow is incomplete.
 * It is not a user-facing experiment: only the explicitly authorized synthetic
 * staging database can use the unfinished approval/submit actions. Never rely on
 * VERCEL_ENV or VEXIM_DEPLOY_ENV alone to authorize a production database write.
 */
export function isSyntheticProductFormStaging(): boolean {
  if (process.env.VEXIM_DEPLOY_ENV !== "staging") return false;
  const value = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "vqyekpritfobxkrlisan.supabase.co" &&
      !url.username && !url.password && !url.port && (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash;
  } catch { return false; }
}
