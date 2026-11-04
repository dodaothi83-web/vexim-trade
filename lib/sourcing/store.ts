import "server-only";
import { localStore } from "@/lib/db/local";
import { supabaseConfigured, supabaseStore } from "@/lib/db/supabase";

/** Never acknowledge a live sourcing request by silently falling back to local disk. */
export function sourcingStore() {
  if (supabaseConfigured()) return supabaseStore;
  if (process.env.NODE_ENV === "production" || (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "development")) throw new Error("Sourcing storage is not configured");
  return localStore;
}
