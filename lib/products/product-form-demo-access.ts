import "server-only";

/** A visual playground, never active on deployed environments or with a DB configured. */
export function isIsolatedProductFormDemo(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV &&
    process.env.VEXIM_FORM_UI_DEMO === "true" &&
    !process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY && !process.env.DATABASE_URL;
}
