"use server";

import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { guard, getSession } from "@/lib/auth/session";
import { notifySupplierDecision } from "@/lib/supplier-portal/notify";

type Result = { ok: boolean; message: string };

/** Account activation is a separate, explicit staff decision, never an audit/publication side effect. */
export async function decideSupplierOnboardingAction(form: FormData): Promise<Result> {
  const denied = await guard("suppliers.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "sourcing")) return { ok: false, message: "Chỉ quản trị và thu mua được xác nhận tài khoản NCC." };
  const id = String(form.get("supplier_id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approved", "changes_requested"].includes(decision)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  if (decision === "changes_requested" && !note) return { ok: false, message: "Vui lòng ghi rõ thông tin cần bổ sung." };
  try {
    const store = getStore();
    const supplier = await store.getSupplier(id);
    if (!supplier || supplier.onboarding_status !== "pending") return { ok: false, message: "Hồ sơ không còn ở trạng thái chờ xác nhận. Tải lại trang." };
    if (decision === "approved") {
      const owner = await store.getUserBySupplierId(id);
      if (!owner || owner.role !== "supplier" || !owner.is_active || owner.supplier_id !== id) {
        return { ok: false, message: "Không tìm thấy tài khoản NCC đang hoạt động liên kết hồ sơ này." };
      }
      const review = (await store.listVerifications(id)).find((v) => v.target_level === 1);
      if (!supplier.name || !supplier.products || !supplier.phone || !supplier.tax_id || !supplier.supplier_type ||
          !review?.tax_number) {
        return { ok: false, message: "Hồ sơ chưa đầy đủ thông tin doanh nghiệp hoặc mã số thuế." };
      }
    }
    await store.updateSupplier(id, { onboarding_status: decision as "approved" | "changes_requested", onboarding_note: decision === "approved" ? null : note });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: id, action: decision === "approved" ? "supplier.portal_access_approved" : "supplier.profile_changes_requested",
      before: { onboarding_status: supplier.onboarding_status }, after: { onboarding_status: decision, note: decision === "approved" ? null : note } })
      .catch((error) => console.error("[supplier-onboarding] audit log failed after staff decision", error));
    const mail = await notifySupplierDecision({ supplierId: id,
      decision: decision === "approved" ? "onboarding_approved" : "onboarding_changes_requested", note });
    if (mail !== "sent") console.warn("[supplier-onboarding] supplier email not sent; decision saved", mail);
    revalidatePath(`/crm/suppliers/${id}`);
    revalidatePath("/crm/suppliers");
    revalidatePath("/supplier/portal");
    return { ok: true, message: (decision === "approved" ? "Đã mở quyền cổng NCC. Chưa duyệt xác minh/công khai hồ sơ." : "Đã lưu yêu cầu bổ sung hồ sơ.") + (mail === "sent" ? "" : " Email NCC chưa gửi được; quyết định đã lưu trên cổng.") };
  } catch (error) {
    console.error("[supplier-onboarding] staff decision failed", error);
    return { ok: false, message: "Không lưu được quyết định. Vui lòng kiểm tra hồ sơ và thử lại." };
  }
}
