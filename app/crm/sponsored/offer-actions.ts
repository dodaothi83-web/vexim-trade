"use server";

import { getSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { parseOfferSettings } from "@/lib/sponsored/offer-settings";
import { revalidatePath } from "next/cache";

export interface OfferActionResult { ok: boolean; message: string }
export async function updateOfferSettingsAction(_previous: OfferActionResult, fd: FormData): Promise<OfferActionResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, message: "Chỉ quản trị viên đang hoạt động được sửa cấu hình." };
  const db = getSupabaseClient();
  if (!db) return { ok: false, message: "Chưa kết nối được cơ sở dữ liệu. Không lưu cấu hình." };
  try {
    // getSession may use a cached signed cookie during outages; always recheck the strict store.
    const user = await supabaseStore.getUser(session.uid);
    if (!user || !user.is_active || user.role !== "admin" || user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) {
      return { ok: false, message: "Không xác nhận được quyền quản trị viên." };
    }
    const values = parseOfferSettings(fd);
    if (!values) return { ok: false, message: "Giá phải là số nguyên từ 1 đến 1 tỷ đồng (hoặc để trống); thời gian giữ chỗ 1–1440 phút; số gói mỗi ô 1–20." };
    const { data, error } = await db.from("sponsored_offer_settings").update({ ...values, updated_by: user.id }).eq("id", true).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "missing settings row");
    revalidatePath("/crm/sponsored");
    revalidatePath("/supplier/portal/boost");
    return { ok: true, message: "Đã lưu cấu hình. Chức năng mua và giữ chỗ chưa được mở." };
  } catch (error) {
    console.error("[sponsored-offer] failed to update settings", error);
    return { ok: false, message: "Chưa xác nhận được cấu hình. Hãy tải lại trang để kiểm tra." };
  }
}
