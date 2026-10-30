import "server-only";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { isSyntheticProductFormStaging } from "@/lib/products/product-form-staging-access";

/** Resolve the active reviewer from the same database as the private submissions. */
export async function requireProductFormReviewer() {
  if (!isSyntheticProductFormStaging()) redirect("/crm/products");
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "reviewer") redirect("/crm/products");
  const db = getSupabaseClient();
  if (!db) throw new Error("Không kết nối được cơ sở dữ liệu.");
  const actor = await supabaseStore.getUser(session.uid);
  if (!actor?.is_active || actor.role !== session.role || actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase())
    throw new Error("Không xác nhận được quyền xét duyệt.");
  return { db, actor };
}
