"use server";

import { revalidatePath } from "next/cache";
import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { nextStatusOptions, statusMeta } from "@/lib/supplier";
import type { SupplierStatus } from "@/lib/types";

/** Publication decision only. Reviewers never submit supplier profile fields with this action. */
export async function decideSupplierPublicationAction(id: string, status: SupplierStatus) {
  const denied = await guard("suppliers.publish");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  try {
    const store = getStore();
    const supplier = await store.getSupplier(id);
    if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
    // Other workflow transitions remain with the preparer. Only public visibility is a reviewer decision.
    if ((status !== "published" && supplier.status !== "published") ||
        !nextStatusOptions(supplier.status).includes(status)) {
      return { ok: false, message: "Chuyển trạng thái không hợp lệ. Tải lại trang và thử lại." };
    }
    await store.updateSupplier(id, { status });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: id, action: "supplier.publication_decided",
      before: { status: supplier.status }, after: { status } })
      .catch((error) => console.error("[supplier-publication] audit log failed after decision", error));
    revalidatePath(`/crm/suppliers/${id}`);
    revalidatePath("/crm/suppliers");
    revalidatePath("/");
    return { ok: true, message: `Đã chuyển sang ${statusMeta(status).label}.` };
  } catch (error) {
    console.error("[supplier-publication] decision failed", error);
    return { ok: false, message: "Không lưu được quyết định. Vui lòng thử lại." };
  }
}

/** Private workflow transitions for preparers; never changes content or public visibility. */
export async function decideSupplierPreparationAction(id: string, status: SupplierStatus) {
  const denied = await guard("suppliers.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  if (!session || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  if (!(["draft", "submitted", "in_verification"] as SupplierStatus[]).includes(status)) {
    return { ok: false, message: "Thao tác này chỉ dành cho các bước chuẩn bị hồ sơ." };
  }
  try {
    const store = getStore();
    const supplier = await store.getSupplier(id);
    if (!supplier) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
    if (!nextStatusOptions(supplier.status).includes(status)) {
      return { ok: false, message: "Chuyển trạng thái không hợp lệ. Tải lại trang và thử lại." };
    }
    await store.updateSupplier(id, { status });
    await store.addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: "supplier", entity_id: id, action: "supplier.preparation_decided",
      before: { status: supplier.status }, after: { status } })
      .catch((error) => console.error("[supplier-preparation] audit log failed after decision", error));
    revalidatePath(`/crm/suppliers/${id}`);
    revalidatePath("/crm/suppliers");
    return { ok: true, message: `Đã chuyển sang ${statusMeta(status).label}.` };
  } catch (error) {
    console.error("[supplier-preparation] decision failed", error);
    return { ok: false, message: "Không lưu được quyết định. Vui lòng thử lại." };
  }
}
