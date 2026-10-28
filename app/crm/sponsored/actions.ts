"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";

const PATH = "/crm/sponsored";
function back(code: string, kind: "ok" | "err" = "ok"): never {
  redirect(`${PATH}?${kind}=${code}`);
}

/** The only remaining package mutation is an audited stop for violation. */
export async function pausePushAction(fd: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") back("forbidden", "err");
  const db = getSupabaseClient();
  if (!db) back("stop-error", "err");
  const id = typeof fd.get("id") === "string" ? String(fd.get("id")).trim() : "";
  const reason = typeof fd.get("reason") === "string" ? String(fd.get("reason")).trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || reason.length < 5 || reason.length > 400) back("stop-invalid", "err");
  let stopped: boolean;
  try {
    // Do not rely on the signed-cookie fallback if the database is unavailable.
    const user = await supabaseStore.getUser(session.uid);
    if (!user || !user.is_active || user.role !== "admin" || user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) back("forbidden", "err");
    const { data, error } = await db.rpc("stop_sponsored_for_violation", { p_push_id: id, p_actor_id: user.id, p_reason: reason });
    if (error) throw new Error(error.message);
    stopped = data === true;
  } catch (error) {
    // Next.js redirects throw and must propagate, not become an outage message.
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    console.error("[sponsored] unable to stop package", error);
    back("stop-error", "err");
  }
  if (!stopped) back("changed", "err");
  revalidatePath(PATH);
  revalidatePath("/supplier/portal/boost");
  back("paused");
}
