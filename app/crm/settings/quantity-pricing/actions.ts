"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { matchStandardGrade, standardGradesForCategory } from "@/lib/products/grade-pricing";
import { parseGradeBounds, parseQuantityPriceSettings } from "@/lib/products/quantity-price-settings";

export type PricingSettingsResult = { ok: boolean; message: string };

async function admin() {
  const session = await getSession();
  const db = getSupabaseClient();
  if (!session || session.role !== "admin" || !db) return null;
  // Never fall back to local data when verifying permission to change live settings.
  const user = await supabaseStore.getUser(session.uid);
  if (!user?.is_active || user.role !== "admin" || user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) return null;
  return { db, user };
}

export async function saveQuantityPriceSettings(_previous: PricingSettingsResult, fd: FormData): Promise<PricingSettingsResult> {
  try {
    const access = await admin();
    if (!access) return { ok: false, message: "Không xác nhận được quyền quản trị hoặc kết nối cơ sở dữ liệu." };
    const values = parseQuantityPriceSettings(fd);
    if (!values) return { ok: false, message: "Thông số không hợp lệ. Hãy kiểm tra giới hạn, số ngày và số thập phân." };
    const { data: before, error: readError } = await access.db.from("quantity_price_settings").select("*").eq("singleton", true).single();
    if (readError || !before) throw new Error(readError?.message ?? "Missing settings");
    const { data, error } = await access.db.from("quantity_price_settings")
      .update({ ...values, updated_at: new Date().toISOString() }).eq("singleton", true).select("singleton").single();
    if (error || !data) throw new Error(error?.message ?? "Settings update failed");
    await supabaseStore.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "settings", entity_id: "quantity_pricing", action: "quantity_pricing.settings_updated", before, after: values,
    }).catch((error) => console.error("[quantity-pricing] settings audit", error));
    revalidatePath("/crm/settings/quantity-pricing");
    return { ok: true, message: "Đã lưu cấu hình chuẩn bị. Mô hình giá mới chưa được bật." };
  } catch (error) {
    console.error("[quantity-pricing] settings update", error);
    return { ok: false, message: "Chưa lưu được cấu hình. Kiểm tra kết nối và migration 20261053." };
  }
}

export async function saveGradePriceBounds(_previous: PricingSettingsResult, fd: FormData): Promise<PricingSettingsResult> {
  try {
    const access = await admin();
    if (!access) return { ok: false, message: "Không xác nhận được quyền quản trị hoặc kết nối cơ sở dữ liệu." };
    const categoryId = typeof fd.get("category_id") === "string" ? String(fd.get("category_id")) : "";
    const inputGrade = typeof fd.get("grade") === "string" ? String(fd.get("grade")) : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      return { ok: false, message: "Chọn danh mục hợp lệ." };
    }
    const category = await supabaseStore.getCategory(categoryId);
    const grade = category && matchStandardGrade(inputGrade, standardGradesForCategory(category));
    if (!category || !grade) return { ok: false, message: "Chọn grade chuẩn thuộc danh mục." };
    const parsed = parseGradeBounds(fd);
    if (!parsed.ok) return { ok: false, message: "Nhập cả hai ngưỡng USD/kg lớn hơn 0, giá đến không nhỏ hơn giá từ; hoặc để trống cả hai để xóa." };
    const { data: before, error: readError } = await access.db.from("category_grade_price_bounds").select("*").eq("category_id", categoryId).eq("grade", grade).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (parsed.bounds) {
      const { error } = await access.db.from("category_grade_price_bounds").upsert({ category_id: categoryId, grade, ...parsed.bounds, updated_at: new Date().toISOString() }, { onConflict: "category_id,grade" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await access.db.from("category_grade_price_bounds").delete().eq("category_id", categoryId).eq("grade", grade);
      if (error) throw new Error(error.message);
    }
    await supabaseStore.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email,
      entity: "category", entity_id: categoryId, action: "quantity_pricing.grade_bounds_updated", before, after: { grade, bounds: parsed.bounds },
    }).catch((error) => console.error("[quantity-pricing] grade bounds audit", error));
    revalidatePath("/crm/settings/quantity-pricing");
    return { ok: true, message: parsed.bounds ? `Đã lưu ngưỡng cho ${grade}. Mô hình giá mới chưa được bật.` : `Đã xóa ngưỡng cho ${grade}.` };
  } catch (error) {
    console.error("[quantity-pricing] grade bounds update", error);
    return { ok: false, message: "Chưa lưu được ngưỡng giá. Kiểm tra kết nối và migration 20261053." };
  }
}
