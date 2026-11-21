"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/db/supabase";
import { getStore } from "@/lib/db";
import { PLAN_FEATURE_LENGTH, PLAN_FEATURE_MAX, PLAN_PRICE_MAX } from "@/lib/supplier-plan-catalog";
import { isSupplierPlan } from "@/lib/supplier-plans";

export type PlanCatalogResult = { ok: boolean; message: string } | null;

/**
 * Quản trị sửa nội dung một gói: tên, mô tả ngắn, quyền lợi, bảng giá, số sản phẩm tối đa và
 * quyền dùng nội dung A+ (ảnh, video trong mô tả chi tiết). Số sản phẩm tối đa có hiệu lực ngay (trigger tạo sản phẩm đọc bảng này);
 * hạ mức không ẩn sản phẩm đã có.
 */
export async function savePlanCatalogAction(_previous: PlanCatalogResult, form: FormData): Promise<PlanCatalogResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, message: "Chỉ quản trị viên được sửa gói." };
  const plan = form.get("plan");
  if (!isSupplierPlan(plan)) return { ok: false, message: "Gói không hợp lệ." };
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 60) return { ok: false, message: "Tên gói cần 1–60 ký tự." };
  const summary = String(form.get("summary") ?? "").trim();
  if (summary.length > 300) return { ok: false, message: "Mô tả ngắn tối đa 300 ký tự." };
  const features = String(form.get("features") ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (features.length > PLAN_FEATURE_MAX) return { ok: false, message: `Tối đa ${PLAN_FEATURE_MAX} dòng quyền lợi.` };
  if (features.some((line) => line.length > PLAN_FEATURE_LENGTH)) return { ok: false, message: `Mỗi dòng quyền lợi tối đa ${PLAN_FEATURE_LENGTH} ký tự.` };
  const rawMax = String(form.get("max_products") ?? "").trim();
  if (rawMax && !/^\d{1,6}$/.test(rawMax)) return { ok: false, message: "Số sản phẩm tối đa chỉ gồm chữ số; để trống là không giới hạn." };
  const maxProducts = rawMax ? Number(rawMax) : null;
  if (maxProducts !== null && maxProducts < 1) return { ok: false, message: "Số sản phẩm tối đa phải từ 1 trở lên." };
  const richContent = form.get("rich_content") === "yes";

  const months = form.getAll("price_months").map((v) => String(v).trim());
  const amounts = form.getAll("price_vnd").map((v) => String(v).replace(/[^\d]/g, ""));
  const prices: Array<{ months: number; price_vnd: number }> = [];
  for (let i = 0; i < months.length; i++) {
    if (!months[i] && !amounts[i]) continue;
    const m = Number(months[i]), price = Number(amounts[i]);
    if (!/^\d{1,3}$/.test(months[i]) || m < 1 || m > 120 || !amounts[i] || !Number.isFinite(price))
      return { ok: false, message: "Mỗi dòng giá cần số tháng (1–120) và số tiền." };
    if (prices.some((p) => p.months === m)) return { ok: false, message: `Thời hạn ${m} tháng bị trùng.` };
    prices.push({ months: m, price_vnd: price });
  }
  if (prices.length > PLAN_PRICE_MAX) return { ok: false, message: `Tối đa ${PLAN_PRICE_MAX} mức giá.` };
  prices.sort((a, b) => a.months - b.months);

  const db = getSupabaseClient();
  if (!db) return { ok: false, message: "Chưa kết nối cơ sở dữ liệu." };
  const row = { plan, name, summary, features, prices, max_products: maxProducts, rich_content: richContent,
    updated_at: new Date().toISOString(), updated_by: /^[0-9a-f-]{36}$/i.test(session.uid) ? session.uid : null };
  const { error } = await db.from("supplier_plan_catalog").upsert(row, { onConflict: "plan" });
  if (error) {
    console.error("[plan-catalog] save failed", error);
    return { ok: false, message: /relation|does not exist|schema cache/i.test(error.message)
      ? "Chưa có bảng gói. Chạy migration 20261129_supplier_plan_catalog.sql rồi thử lại."
      : "Chưa lưu được gói. Thử lại sau ít phút." };
  }
  await getStore().addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "supplier_plan", entity_id: plan,
    action: "supplier_plan.catalog_updated", before: null, after: row }).catch((e) => console.error("[plan-catalog] audit", e));
  revalidatePath("/crm/plans");
  revalidatePath("/crm/plans/catalog");
  revalidatePath("/supplier/portal", "layout");
  return { ok: true, message: `Đã lưu gói ${name}.` };
}
