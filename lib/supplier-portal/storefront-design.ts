/**
 * Lưu "Thiết kế trang": bản nháp, áp dụng (kèm lịch sử phiên bản) và ghi nhận đồng ý cho Vexim
 * thiết kế hộ. Dùng chung cho cổng nhà cung cấp và CRM.
 */
import { getSupabaseClient } from "@/lib/db/supabase";
import type { DataStore as Store } from "@/lib/db/types";
import { fill } from "@/lib/i18n/format";
import type { DesignerMessages } from "@/lib/i18n/portal/designer";
import { readStorefrontLayout, type LayoutProblem, type StorefrontLayout } from "@/lib/storefront-layout";
import { normalizeStorefrontTheme } from "@/lib/storefront-theme";
import type { Supplier } from "@/lib/types";

export type StorefrontVersion = {
  id: string;
  layout: StorefrontLayout | null;
  applied_role: "supplier" | "staff";
  applied_by_email: string | null;
  note: string | null;
  created_at: string;
};

export type DesignConsent = {
  id: string;
  representative: string;
  consented_on: string;
  method: "contract" | "email" | "zalo" | "other";
  evidence: string;
  scope: "storefront" | "storefront_aplus";
  recorded_by_email: string | null;
  created_at: string;
};

export const CONSENT_METHODS = ["contract", "email", "zalo", "other"] as const;
export const CONSENT_SCOPES = ["storefront", "storefront_aplus"] as const;

/** Bản nháp đang soạn; chưa có thì bản đang hiện. */
export function draftLayoutOf(supplier: Pick<Supplier, "id" | "storefront_layout" | "storefront_layout_draft">): StorefrontLayout | null {
  return readStorefrontLayout(supplier.storefront_layout_draft, supplier.id) ?? readStorefrontLayout(supplier.storefront_layout, supplier.id);
}

export async function saveStorefrontDraft(store: Store, supplierId: string, layout: StorefrontLayout): Promise<void> {
  await store.updateSupplier(supplierId, { storefront_layout_draft: layout });
}

/**
 * Áp dụng bố cục: người mua thấy ngay. Lưu một phiên bản để khôi phục và đồng bộ mẫu, tông màu,
 * câu giới thiệu, số liệu sang storefront_theme (giao diện cũ đọc từ đây).
 */
export async function applyStorefrontLayout(store: Store, supplier: Supplier, layout: StorefrontLayout, actor: {
  id: string | null; email: string | null; role: "supplier" | "staff"; note?: string | null; consentId?: string | null;
}): Promise<void> {
  const previous = normalizeStorefrontTheme(supplier.storefront_theme);
  const statsBlock = layout.blocks.find((block) => block.type === "stats");
  await store.updateSupplier(supplier.id, {
    storefront_layout: layout,
    storefront_layout_draft: layout,
    storefront_theme: { template: layout.template, tone: layout.tone, tagline: layout.tagline,
      stats: statsBlock?.type === "stats" ? statsBlock.stats : previous.stats },
  });
  const db = getSupabaseClient();
  if (!db) return;
  const { error } = await db.from("supplier_storefront_versions").insert({
    supplier_id: supplier.id, layout, applied_by: actor.id, applied_by_email: actor.email,
    applied_role: actor.role, note: actor.note ?? null, consent_id: actor.consentId ?? null,
  });
  if (error) console.error("[storefront-design] version", error);
}

export async function listStorefrontVersions(supplierId: string, limit = 10): Promise<StorefrontVersion[]> {
  const db = getSupabaseClient();
  if (!db) return [];
  const { data, error } = await db.from("supplier_storefront_versions")
    .select("id, layout, applied_role, applied_by_email, note, created_at")
    .eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(limit);
  if (error) { console.error("[storefront-design] versions", error); return []; }
  return ((data ?? []) as Array<Omit<StorefrontVersion, "layout"> & { layout: unknown }>)
    .map((row) => ({ ...row, layout: readStorefrontLayout(row.layout, supplierId) }));
}

export async function getStorefrontVersion(supplierId: string, versionId: string): Promise<StorefrontVersion | null> {
  const db = getSupabaseClient();
  if (!db || !/^[0-9a-f-]{36}$/i.test(versionId)) return null;
  const { data, error } = await db.from("supplier_storefront_versions")
    .select("id, layout, applied_role, applied_by_email, note, created_at")
    .eq("supplier_id", supplierId).eq("id", versionId).maybeSingle();
  if (error || !data) return null;
  const row = data as Omit<StorefrontVersion, "layout"> & { layout: unknown };
  return { ...row, layout: readStorefrontLayout(row.layout, supplierId) };
}

/** Đồng ý thiết kế hộ đang hiệu lực (mới nhất, chưa thu hồi). */
export async function activeDesignConsent(supplierId: string): Promise<DesignConsent | null> {
  const db = getSupabaseClient();
  if (!db) return null;
  const { data, error } = await db.from("supplier_design_consents")
    .select("id, representative, consented_on, method, evidence, scope, recorded_by_email, created_at")
    .eq("supplier_id", supplierId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error("[storefront-design] consent", error); return null; }
  return (data as DesignConsent | null) ?? null;
}

export async function recordDesignConsent(input: Omit<DesignConsent, "id" | "created_at" | "recorded_by_email"> & {
  supplierId: string; recordedBy: string | null; recordedByEmail: string | null;
}): Promise<DesignConsent> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Chưa kết nối CSDL.");
  const { data, error } = await db.from("supplier_design_consents").insert({
    supplier_id: input.supplierId, representative: input.representative, consented_on: input.consented_on,
    method: input.method, evidence: input.evidence, scope: input.scope,
    recorded_by: input.recordedBy, recorded_by_email: input.recordedByEmail,
  }).select("id, representative, consented_on, method, evidence, scope, recorded_by_email, created_at").single();
  if (error || !data) throw error ?? new Error("consent_insert_failed");
  return data as DesignConsent;
}

export async function revokeDesignConsent(supplierId: string, consentId: string, email: string | null): Promise<void> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Chưa kết nối CSDL.");
  const { error } = await db.from("supplier_design_consents").update({ revoked_at: new Date().toISOString(), revoked_by_email: email })
    .eq("supplier_id", supplierId).eq("id", consentId).is("revoked_at", null);
  if (error) throw error;
}

/** Câu báo lỗi bố cục, dùng chung cổng nhà cung cấp và CRM. */
export function layoutProblemMessage(problem: LayoutProblem, e: DesignerMessages["errors"]): string {
  if (problem.code === "tooMany") return e.tooMany;
  if (problem.code === "tagline") return e.tagline;
  return fill(e[problem.code], { index: problem.index + 1 });
}

