"use server";

import { revalidatePath } from "next/cache";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { isSupplierPlan, SUPPLIER_PLAN_LABELS } from "@/lib/supplier-plans";
import { notifySupplierPlanChange } from "@/lib/supplier-portal/notify";
import { readPlanCatalog, recordPlanActivation } from "@/lib/supplier-plan-catalog";
import { supplierGate } from "@/lib/auth/supplier-access";

type Result = { ok: boolean; message: string };

async function closeUpgradeRequests(store: ReturnType<typeof getStore>, supplierId: string, session: { uid: string; email: string }) {
  const open = (await store.listSupplierServiceRequests({ supplierId, status: "submitted", limit: 10 }))
    .filter((r) => r.service_key === "plan_upgrade");
  for (const r of open) {
    const updated = await store.updateSupplierServiceRequest(r.id, { status: "active", handled_by: session.uid });
    if (!updated) continue;
    await store.addAuditLog({
      actor_id: session.uid, actor_email: session.email, entity: "supplier", entity_id: supplierId,
      action: "supplier.service_request_status",
      before: { request_id: r.id, status: r.status }, after: { request_id: r.id, status: "active", via: "plan_activated" },
    }).catch((error) => console.error("[supplier-plan] audit request", error));
  }
}

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
  const scopeGate = await supplierGate(supplierId);
  if (scopeGate) return scopeGate;
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
  // Thời hạn và số tiền ghi nhận chỉ để báo cáo; không có thì vẫn lưu được gói.
  const rawMonths = String(form.get("months") ?? "").trim();
  const months = plan !== "basic" && /^\d{1,3}$/.test(rawMonths) && Number(rawMonths) >= 1 && Number(rawMonths) <= 120 ? Number(rawMonths) : null;
  const rawAmount = String(form.get("amount_vnd") ?? "").trim();
  if (rawAmount && !/^\d{1,12}$/.test(rawAmount)) return { ok: false, message: "Số tiền ghi nhận chỉ gồm chữ số." };
  // Không nhập số tiền thì ghi theo giá niêm yết của thời hạn đã chọn, để quản trị biết ai bán gói nào, bao nhiêu.
  const listPrice = plan !== "basic" && months
    ? (await readPlanCatalog().catch(() => null))?.[plan]?.prices.find((p) => p.months === months)?.price_vnd ?? null
    : null;
  const amountVnd = plan !== "basic" ? (rawAmount ? Number(rawAmount) : listPrice) : null;
  const amountSource = plan === "basic" ? null : rawAmount ? "entered" : listPrice !== null ? "list_price" : null;

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
    after: { plan, plan_expires_at: expiresAt, months, amount_vnd: amountVnd, amount_source: amountSource,
      actor_role: session.role, owner_user_id: before.owner_user_id ?? null },
  }).catch((error) => console.error("[supplier-plan] audit", error));
  // Mỗi lần bật/gia hạn gói trả phí là một dòng cho báo cáo doanh thu ở /crm/plans.
  if (plan !== "basic") await recordPlanActivation({ supplierId, plan, months, amountVnd, expiresAt, actorId: session.uid })
    .catch((error) => console.error("[supplier-plan] activation log", error));
  // Mở gói trả phí là xong việc của yêu cầu nâng gói đang "Mới": tự chuyển sang "Đã mở"
  // để chuông, nhãn CRM và dòng chờ trong cổng nhà cung cấp cùng biến mất.
  if (plan !== "basic") await closeUpgradeRequests(store, supplierId, session).catch((error) => console.error("[supplier-plan] close request", error));
  revalidatePath(`/crm/suppliers/${supplierId}`);
  revalidatePath("/crm/service-requests");
  revalidatePath("/supplier/portal", "layout");
  // Báo nhà cung cấp qua email; chuông trong cổng đọc plan_updated_at. Thư lỗi không làm hỏng việc lưu gói.
  const mail = await notifySupplierPlanChange({ supplierId, plan, previousPlan, expiresOn: plan !== "basic" && rawDate ? rawDate : null })
    .catch(() => "failed" as const);
  const mailNote = mail === "failed" ? " Chưa gửi được email cho nhà cung cấp; thông báo vẫn hiện trong cổng." : "";
  return { ok: true, message: `Đã chuyển sang gói ${SUPPLIER_PLAN_LABELS[plan]}${expiresAt ? `, hết hạn ${rawDate.split("-").reverse().join("/")}` : ""}.${mailNote}` };
}
