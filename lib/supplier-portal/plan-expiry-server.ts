import "server-only";

import { getStore } from "@/lib/db";
import { getSupabaseClient } from "@/lib/db/supabase";
import { effectiveSupplierPlan, isSupplierPlan } from "@/lib/supplier-plans";
import { PLAN_EXPIRING_DAYS, planReminderKind } from "@/lib/supplier-plan-expiry";
import { notifySupplierPlanExpiry } from "@/lib/supplier-portal/notify";

/**
 * Chạy hằng ngày trong cron chung (/api/cron/rfq-sla):
 * 1. Email nhắc nhà cung cấp khi gói trả phí còn 30 ngày, 7 ngày và khi đã hết hạn.
 *    Mỗi mốc của một ngày hết hạn chỉ gửi một lần (bảng supplier_plan_reminders).
 * 2. Yêu cầu nâng gói "Đã mở" của nhà cung cấp đã về Basic thì chuyển sang "Hết hạn".
 * Không đổi gói hay giá: hết hạn vẫn do effectiveSupplierPlan tính theo plan_expires_at.
 */
export async function runPlanExpiry(now = Date.now()): Promise<{ reminded: number; failed: number; expiredRequests: number } | { skipped: string }> {
  const db = getSupabaseClient();
  if (!db) return { skipped: "no database" };
  const store = getStore();
  const suppliers = (await store.listSuppliers()).filter((s) => !s.is_demo);

  const due = suppliers.flatMap((s) => {
    if (!isSupplierPlan(s.plan) || s.plan === "basic" || !s.plan_expires_at) return [];
    const kind = planReminderKind(s.plan_expires_at, now);
    return kind ? [{ supplier: s, plan: s.plan, expiresAt: new Date(s.plan_expires_at).toISOString(), kind }] : [];
  });

  let reminded = 0, failed = 0;
  for (const item of due) {
    // Ghi trước, gửi sau: hai lần chạy chồng nhau không gửi trùng. Gửi lỗi thì xoá dòng để hôm sau thử lại.
    const { data, error } = await db.from("supplier_plan_reminders")
      .upsert({ supplier_id: item.supplier.id, plan_expires_at: item.expiresAt, kind: item.kind }, { onConflict: "supplier_id,plan_expires_at,kind", ignoreDuplicates: true })
      .select("supplier_id");
    if (error) throw new Error(`plan reminders: ${error.message}`);
    if (!data?.length) continue;
    const result = await notifySupplierPlanExpiry({ supplierId: item.supplier.id, plan: item.plan, kind: item.kind, expiresAt: item.expiresAt, now })
      .catch(() => "failed" as const);
    if (result === "failed") {
      failed++;
      await db.from("supplier_plan_reminders").delete()
        .match({ supplier_id: item.supplier.id, plan_expires_at: item.expiresAt, kind: item.kind });
    } else reminded++;
  }

  let expiredRequests = 0;
  const active = (await store.listSupplierServiceRequests({ status: "active", limit: 500 })).filter((r) => r.service_key === "plan_upgrade");
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  for (const r of active) {
    const s = byId.get(r.supplier_id);
    if (!s || effectiveSupplierPlan(s, new Date(now)) !== "basic") continue;
    const updated = await store.updateSupplierServiceRequest(r.id, { status: "expired", handled_by: null });
    if (!updated) continue;
    expiredRequests++;
    await store.addAuditLog({
      actor_id: null, actor_email: "system", entity: "supplier", entity_id: r.supplier_id,
      action: "supplier.service_request_status",
      before: { request_id: r.id, status: r.status }, after: { request_id: r.id, status: "expired", via: "plan_expired" },
    }).catch((error) => console.error("[plan-expiry] audit", error));
  }
  return { reminded, failed, expiredRequests };
}

/** Số nhà cung cấp có gói trả phí còn hiệu lực và hết hạn trong 30 ngày (cho chuông CRM). */
export async function countPaidPlansExpiring(now = Date.now(), supplierIds: readonly string[] | null = null): Promise<number> {
  const db = getSupabaseClient();
  if (!db) return 0;
  // supplierIds: kinh doanh chỉ đếm nhà cung cấp mình phụ trách; null = tất cả.
  if (supplierIds && supplierIds.length === 0) return 0;
  let query = db.from("suppliers").select("id", { count: "exact", head: true })
    .in("plan", ["premium", "pro"]).eq("is_demo", false)
    .gt("plan_expires_at", new Date(now).toISOString())
    .lte("plan_expires_at", new Date(now + PLAN_EXPIRING_DAYS * 86_400_000).toISOString());
  if (supplierIds) query = query.in("id", [...supplierIds]);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
