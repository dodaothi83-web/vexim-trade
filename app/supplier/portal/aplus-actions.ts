"use server";

import { revalidatePath } from "next/cache";

import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { deleteObject } from "@/lib/media/storage";
import { APLUS_MAX_MODULES, aplusImagePaths, canEditAplus, readAplusModules, validateAplusModules } from "@/lib/products/aplus";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";

export type AplusSaveResult = { ok: boolean; message: string };

/**
 * Lưu nội dung A+ của một sản phẩm. Danh tính và quyền gói lấy từ phiên đăng nhập; lưu là hiện
 * ngay cho người mua (Vexim có thể gỡ khối vi phạm trong CRM). Ảnh bị bỏ khỏi nội dung thì xoá tệp.
 */
export async function saveProductAplusAction(productId: string, modules: unknown): Promise<AplusSaveResult> {
  const { m } = await getPortalMessages();
  const e = m.aplus.errors;
  try {
    const access = await supplierPortalAccess();
    if (!access || !portalApproved(access.supplier)) return { ok: false, message: e.noAccess };
    const product = await access.store.getProduct(productId);
    if (!product || product.supplier_id !== access.supplier.id || !canEditAplus(product)) return { ok: false, message: e.noAccess };
    if (!supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).richContent) return { ok: false, message: e.plan };
    const ctx = { supplierId: access.supplier.id, productId };
    const checked = validateAplusModules(modules, ctx);
    if (!checked.ok) {
      const { problem } = checked;
      if (problem.code === "tooMany") return { ok: false, message: fill(e.tooMany, { max: APLUS_MAX_MODULES }) };
      const key = problem.code === "video" ? "videoMissing" : problem.code;
      return { ok: false, message: fill(e[key], { index: problem.index + 1 }) };
    }
    const previous = aplusImagePaths(readAplusModules(product.aplus_content, ctx));
    await access.store.updateProduct(productId, { aplus_content: checked.modules });
    const kept = new Set(aplusImagePaths(checked.modules));
    await Promise.all(previous.filter((path) => !kept.has(path)).map((path) => deleteObject(path).catch(() => null)));
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email, entity: "product", entity_id: productId,
      action: "supplier.product_aplus_saved", before: { modules: previous.length }, after: { modules: checked.modules.length, types: checked.modules.map((x) => x.type) } })
      .catch((error) => console.error("[aplus] audit", error));
    revalidatePath(`/supplier/portal/products/${productId}`);
    revalidatePath("/products", "layout");
    return { ok: true, message: m.aplus.saved };
  } catch (error) {
    console.error("[aplus] save", error);
    return { ok: false, message: e.failed };
  }
}
