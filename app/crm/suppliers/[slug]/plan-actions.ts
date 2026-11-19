"use server";

import { revalidatePath } from "next/cache";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { isSupplierPlan, SUPPLIER_PLAN_LABELS } from "@/lib/supplier-plans";
import { notifySupplierPlanChange } from "@/lib/supplier-portal/notify";

type Result = { ok: boolean; message: string };

/**
 * Nhân viên đổi gói nhà cung cấp sau khi đã thu phí ngoài hệ thống.
 * Hạ gói không ẩn sản phẩm đã có; chỉ chặn thêm mới khi vượt số sản phẩm của gói.
 */
export async function setSupplierPlanAction(form: FormData): Promise<Result> {
  const gate = await guard("suppliers.manage");
  if (gate) return gate;
  const session = await getSession();
  if (!session) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };

  const supplierId = String(form.get("supplier_id") ?? "");
  const plan = form.get("plan");
  if (!supplierId || !isSupplierPlan(plan)) return { ok: false, message: "Gói không hợp lệ." };
  const rawDate = String(form.get("expires_on") ?? "").trim();
  let expiresAt: string | null = null;
  if (plan !== "basic" && rawDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return { ok: false, message: "Ngày hết hạn không hợp lệ." };
    // Hết hạn vào cuối ngày theo giờ Việt Nam.
    const end = new Date(`${rawDate}T23:59:59+07:00`);
    if (!Number.isFinite(end.getTime())) return { ok: false, message: "Ngày hết hạn không hợp lệ." };
    if (end.getTime() <= Date.now()) return { ok: false, message: "Ngày hết hạn phải ở tương lai." };
    expiresAt = end.toISOString();
  }

  const store = getStore();
  const before = await store.getSupplier(supplierId);
  if (!before) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
  const previousPlan = isSupplierPlan(before.plan) ? before.plan : "basic";
  // Lưu lại đúng gói và hạn cũ thì không ghi gì, để nhà cung cấp không nhận thông báo trùng.
  if (previousPlan === plan && (before.plan_expires_at ?? null) === expiresAt) return { ok: true, message: "Gói không thay đổi." };
  try {
    await store.updateSupplier(supplierId, {
      plan, plan_expires_at: expiresAt, plan_updated_at: new Date().toISOString(), plan_updated_by: session.uid,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (/plan/i.test(text) && /column|schema cache|PGRST204/i.test(text))
      return { ok: false, message: "Hệ thống chưa sẵn sàng lưu gói. Báo người phụ trách kỹ thuật rồi thử lại." };
    console.error("[supplier-plan] update failed", error);
    return { ok: false, message: "Chưa lưu được gói. Thử lại sau ít phút." };
  }
  await store.addAuditLog({
    actor_id: session.uid, actor_email: session.email, entity: "supplier", entity_id: supplierId,
    action: "supplier.plan_changed",
    before: { plan: before.plan ?? "basic", plan_expires_at: before.plan_expires_at ?? null },
    after: { plan, plan_expires_at: expiresAt },
  }).catch((error) => console.error("[supplier-plan] audit", error));
  revalidatePath(`/crm/suppliers/${supplierId}`);
  revalidatePath("/supplier/portal", "layout");
  // Báo nhà cung cấp qua email; chuông trong cổng đọc plan_updated_at. Thư lỗi không làm hỏng việc lưu gói.
  const mail = await notifySupplierPlanChange({ supplierId, plan, previousPlan, expiresOn: plan !== "basic" && rawDate ? rawDate : null })
    .catch(() => "failed" as const);
  const mailNote = mail === "failed" ? " Chưa gửi được email cho nhà cung cấp; thông báo vẫn hiện trong cổng." : "";
  return { ok: true, message: `Đã chuyển sang gói ${SUPPLIER_PLAN_LABELS[plan]}${expiresAt ? `, hết hạn ${rawDate.split("-").reverse().join("/")}` : ""}.${mailNote}` };
}
