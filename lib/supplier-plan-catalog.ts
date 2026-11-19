import "server-only";

import { cache } from "react";

import { getSupabaseClient } from "@/lib/db/supabase";
import { DEFAULT_PLAN_CATALOG, SUPPLIER_PLANS, isSupplierPlan, type SupplierPlanCatalog, type SupplierPlanCatalogEntry, type SupplierPlanPrice } from "@/lib/supplier-plans";

export const PLAN_FEATURE_MAX = 12;
export const PLAN_FEATURE_LENGTH = 200;
export const PLAN_PRICE_MAX = 6;

/** Đọc một dòng bảng gói; dữ liệu hỏng thì trả null để dùng giá trị mặc định của gói đó. */
export function normalizePlanRow(row: Record<string, unknown>): SupplierPlanCatalogEntry | null {
  if (!isSupplierPlan(row.plan) || typeof row.name !== "string" || !row.name.trim()) return null;
  const features = Array.isArray(row.features)
    ? row.features.filter((f): f is string => typeof f === "string" && !!f.trim()).map((f) => f.trim().slice(0, PLAN_FEATURE_LENGTH)).slice(0, PLAN_FEATURE_MAX)
    : [];
  const prices: SupplierPlanPrice[] = Array.isArray(row.prices)
    ? row.prices.flatMap((p) => {
      const item = p as { months?: unknown; price_vnd?: unknown };
      const months = Number(item?.months), price = Number(item?.price_vnd);
      return Number.isInteger(months) && months > 0 && months <= 120 && Number.isFinite(price) && price >= 0 ? [{ months, price_vnd: Math.round(price) }] : [];
    }).sort((a, b) => a.months - b.months).slice(0, PLAN_PRICE_MAX)
    : [];
  const max = row.max_products === null || row.max_products === undefined ? null : Number(row.max_products);
  return {
    plan: row.plan, name: row.name.trim().slice(0, 60), summary: typeof row.summary === "string" ? row.summary.trim().slice(0, 300) : "",
    features, prices, maxProducts: max !== null && Number.isInteger(max) && max > 0 ? max : null,
    mediaAllowed: row.media_allowed !== false, updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

/**
 * Bảng gói hiện hành. Chưa có CSDL hoặc chưa chạy migration thì dùng giá trị mặc định,
 * để cổng nhà cung cấp và CRM không trắng trang; trigger trong CSDL vẫn là lớp chặn cuối.
 */
export const readPlanCatalog = cache(async function readPlanCatalog(): Promise<SupplierPlanCatalog> {
  const catalog: SupplierPlanCatalog = { ...DEFAULT_PLAN_CATALOG };
  const db = getSupabaseClient();
  if (!db) return catalog;
  try {
    const { data, error } = await db.from("supplier_plan_catalog").select("plan,name,summary,features,prices,max_products,media_allowed,updated_at");
    if (error || !Array.isArray(data)) throw new Error(error?.message ?? "no data");
    for (const row of data) {
      const entry = normalizePlanRow(row as Record<string, unknown>);
      if (entry) catalog[entry.plan] = entry;
    }
  } catch (error) {
    console.error("[plan-catalog] using defaults", error);
  }
  for (const plan of SUPPLIER_PLANS) catalog[plan] = catalog[plan] ?? DEFAULT_PLAN_CATALOG[plan];
  return catalog;
});

/** Ghi một lần bật/gia hạn gói trả phí. Không có CSDL (chạy cục bộ) thì bỏ qua. */
export async function recordPlanActivation(input: {
  supplierId: string; plan: "premium" | "pro"; months: number | null; amountVnd: number | null; expiresAt: string | null; actorId: string;
}): Promise<void> {
  const db = getSupabaseClient();
  if (!db) return;
  const { error } = await db.from("supplier_plan_activations").insert({
    supplier_id: input.supplierId, plan: input.plan, months: input.months, amount_vnd: input.amountVnd,
    expires_at: input.expiresAt, created_by: /^[0-9a-f-]{36}$/i.test(input.actorId) ? input.actorId : null,
  });
  if (error) throw new Error(error.message);
}

export interface PlanActivation {
  id: string; supplier_id: string; plan: "premium" | "pro"; months: number | null;
  amount_vnd: number | null; starts_at: string; expires_at: string | null; created_at: string;
}

/** Các lần bật/gia hạn gói gần nhất (mới nhất trước), cho báo cáo ở /crm/plans. */
export async function listPlanActivations(limit = 1000): Promise<PlanActivation[]> {
  const db = getSupabaseClient();
  if (!db) return [];
  const { data, error } = await db.from("supplier_plan_activations")
    .select("id,supplier_id,plan,months,amount_vnd,starts_at,expires_at,created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, amount_vnd: row.amount_vnd === null ? null : Number(row.amount_vnd) })) as PlanActivation[];
}
