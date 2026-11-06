import "server-only";

import type { SessionUser } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type PendingRevision = { id: string; product_id: string };
export type CrmReviewInbox = {
  prices: PendingRevision[];
  names: PendingRevision[];
};

/** Never expose private submissions to sales/view-only users, including via search. */
export async function loadCrmReviewInbox(session: SessionUser): Promise<CrmReviewInbox | null> {
  if (session.role !== "admin" && session.role !== "reviewer") return null;
  const db = getSupabaseClient();
  if (!db) throw new Error("Database unavailable");
  const actor = await supabaseStore.getUser(session.uid);
  if (!actor?.is_active || actor.role !== session.role || actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase())
    throw new Error("Reviewer verification failed");
  async function pending(table: string, columns: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db!.from(table).select(columns).eq("status", "pending")
        .order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 499);
      if (error || !Array.isArray(data)) throw new Error("Review inbox unavailable");
      rows.push(...data as unknown as Record<string, unknown>[]);
      if (data.length < 500) return rows;
    }
  }
  const [prices, names] = await Promise.all([
    pending("product_quantity_price_revisions", "id,product_id"),
    pending("product_english_name_revisions", "id,product_id"),
  ]);
  const validRevision = (row: Record<string, unknown>) => typeof row.id === "string" && UUID.test(row.id) &&
    typeof row.product_id === "string" && UUID.test(row.product_id);
  if ([...prices, ...names].some((row) => !validRevision(row))) throw new Error("Invalid review inbox rows");
  return { prices: prices as PendingRevision[], names: names as PendingRevision[] };
}

/**
 * Số sản phẩm có giá hoặc tên tiếng Anh nhà cung cấp gửi, đang chờ rà soát. Dùng cho huy hiệu
 * menu và chuông CRM (trước đây chỉ đếm sản phẩm chờ duyệt nội dung nên giá mới không báo).
 */
export async function countPendingProductRevisions(): Promise<number> {
  const db = getSupabaseClient();
  if (!db) return 0;
  const ids = new Set<string>();
  for (const table of ["product_quantity_price_revisions", "product_english_name_revisions"]) {
    const { data, error } = await db.from(table).select("product_id").eq("status", "pending").limit(2000);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as { product_id: unknown }[]) if (typeof row.product_id === "string") ids.add(row.product_id);
  }
  return ids.size;
}
