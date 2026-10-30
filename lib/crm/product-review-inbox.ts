import "server-only";

import type { SessionUser } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { isProductFormEnabled } from "@/lib/products/product-form-staging-access";
import { parseDraftImageSelection } from "@/lib/products/product-form-image-selection";
import { parseProductFormDraft } from "@/lib/products/product-form-model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type PendingForm = { id: string; product_id: string; supplier_id: string; payload: unknown; image_selection: unknown; image_snapshot: unknown };
type PendingRevision = { id: string; product_id: string };
export type CrmReviewInbox = {
  forms: PendingForm[];
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
  const [forms, prices, names] = await Promise.all([
    isProductFormEnabled() ? pending("product_form_submissions", "id,product_id,supplier_id,payload,image_selection,image_snapshot") : Promise.resolve([]),
    pending("product_quantity_price_revisions", "id,product_id"),
    pending("product_english_name_revisions", "id,product_id"),
  ]);
  const validRevision = (row: Record<string, unknown>) => typeof row.id === "string" && UUID.test(row.id) &&
    typeof row.product_id === "string" && UUID.test(row.product_id);
  if ([...forms, ...prices, ...names].some((row) => !validRevision(row)) || forms.some((row) =>
    typeof row.supplier_id !== "string" || !UUID.test(row.supplier_id))) throw new Error("Invalid review inbox rows");
  return { forms: forms as PendingForm[], prices: prices as PendingRevision[], names: names as PendingRevision[] };
}

/** Parse only the private snapshot for the same product and supplier. */
export function pendingFormSummary(form: PendingForm | undefined, product: { id: string; supplier_id: string }) {
  if (!form || form.product_id !== product.id || form.supplier_id !== product.supplier_id) return null;
  const draft = parseProductFormDraft(form.payload);
  if (!draft) return { id: form.id, draft: null, imageUrl: null };
  const selection = parseDraftImageSelection(form.image_selection);
  const first = selection?.[0];
  const snapshot = Array.isArray(form.image_snapshot) ? form.image_snapshot[0] : null;
  const row = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot.row : null;
  const imageUrl = first?.source === "staged" && Array.isArray(form.image_snapshot) && form.image_snapshot.length === selection?.length &&
    snapshot?.source === "staged" && row && typeof row === "object" && !Array.isArray(row) &&
    row.id === first.id && row.product_id === product.id && row.supplier_id === product.supplier_id ?
    `/api/product-form/images/${encodeURIComponent(product.id)}/${encodeURIComponent(first.id)}` : null;
  return { id: form.id, draft, imageUrl };
}
