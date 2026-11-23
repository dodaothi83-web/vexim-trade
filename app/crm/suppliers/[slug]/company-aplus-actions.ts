"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { deleteStreamVideo } from "@/lib/media/cloudflare-stream";
import { deleteAplusImages } from "@/lib/products/aplus-image-store";
import { aplusImagePaths, aplusVideoUids, COMPANY_APLUS_ID, readAplusModules } from "@/lib/products/aplus";
import { supplierGate } from "@/lib/auth/supplier-access";

/** Nhân viên gỡ một khối A+ doanh nghiệp vi phạm (liên hệ trực tiếp, nội dung sai...). Ghi nhật ký. */
export async function removeCompanyAplusModuleAction(supplierId: string, moduleId: string): Promise<{ ok: boolean; message: string }> {
  const denied = (await guard("suppliers.manage")) ?? (await supplierGate(supplierId));
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  const store = getStore();
  const supplier = await store.getSupplier(supplierId);
  if (!supplier || !session) return { ok: false, message: "Không tìm thấy nhà cung cấp." };
  const modules = readAplusModules(supplier.company_aplus, { supplierId, productId: COMPANY_APLUS_ID });
  const removed = modules.find((m) => m.id === moduleId);
  if (!removed) return { ok: false, message: "Khối đã được gỡ hoặc đã thay đổi. Tải lại trang." };
  const next = modules.filter((m) => m.id !== moduleId);
  try {
    await store.updateSupplier(supplierId, { company_aplus: next });
  } catch (error) {
    console.error("[crm-company-aplus] remove", error);
    return { ok: false, message: "Chưa gỡ được khối. Thử lại sau ít phút." };
  }
  const kept = new Set(aplusImagePaths(next));
  await deleteAplusImages(aplusImagePaths([removed]).filter((p) => !kept.has(p)));
  const keptVideos = new Set(aplusVideoUids(next));
  const dropped = aplusVideoUids([removed]).filter((uid) => !keptVideos.has(uid));
  if (dropped.length) after(() => Promise.all(dropped.map(deleteStreamVideo)));
  await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "supplier", entity_id: supplierId,
    action: "staff.company_aplus_removed", before: { module: removed }, after: { modules: next.length } })
    .catch((error) => console.error("[crm-company-aplus] audit", error));
  revalidatePath(`/crm/suppliers/${supplierId}`);
  if (supplier.slug) revalidatePath(`/suppliers/${supplier.slug}`);
  return { ok: true, message: "Đã gỡ khối A+ doanh nghiệp." };
}
