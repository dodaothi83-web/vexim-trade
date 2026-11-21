"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { aplusTranslationConfigured, translateAplusModules } from "@/lib/ai/translate-aplus";
import { getSession, guard } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { fill } from "@/lib/i18n/format";
import { aplusMessages } from "@/lib/i18n/portal/aplus";
import { deleteStreamVideo } from "@/lib/media/cloudflare-stream";
import { deleteObject } from "@/lib/media/storage";
import {
  APLUS_MAX_MODULES, APLUS_MAX_VIDEOS, aplusVideoLimitExceeded, aplusImagePaths, aplusVideoUids, COMPANY_APLUS_ID, readAplusModules, validateAplusModules, type AplusModule, type AplusProblem,
} from "@/lib/products/aplus";
import { prepareAplusForSave } from "@/lib/products/aplus-server";
import { verifyAplusVideos } from "@/lib/products/aplus-video-verify";

/**
 * Nhân viên Vexim soạn A+ hộ nhà cung cấp (dịch vụ thu phí bên ngoài, chủ sàn chốt 2026-11-21):
 * sửa thẳng vào nội dung A+ của sản phẩm hoặc A+ doanh nghiệp, lưu là đăng ngay. Cùng kiểm tra, dịch
 * như nhà cung cấp tự lưu; mỗi lần lưu ghi nhật ký tên nhân viên. A+ vẫn chỉ hiện khi gói còn quyền.
 */
export type StaffAplusResult = { ok: boolean; message: string; modules?: AplusModule[] };
const e = aplusMessages.vi.errors;

function problemText(problem: AplusProblem): string {
  if (problem.code === "tooMany") return fill(e.tooMany, { max: APLUS_MAX_MODULES });
  const key = problem.code === "video" ? "videoMissing" : problem.code;
  return fill(e[key], { index: problem.index + 1 });
}
const ids = (list: string[]) => new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === "string").slice(0, APLUS_MAX_MODULES));

type Target = { supplierId: string; productId: string | null; before: AplusModule[]; write: (modules: AplusModule[]) => Promise<unknown>; paths: string[] };

async function productTarget(productId: string): Promise<Target | { error: string }> {
  const denied = await guard("products.manage");
  if (denied) return { error: denied.message };
  const store = getStore();
  const product = await store.getProduct(productId);
  if (!product?.supplier_id) return { error: "Không tìm thấy sản phẩm." };
  return {
    supplierId: product.supplier_id, productId: product.id,
    before: readAplusModules(product.aplus_content, { supplierId: product.supplier_id, productId: product.id }),
    // Lưu là đăng: trang sản phẩm chuyển sang hiện A+ (khi còn khối).
    write: (modules) => store.updateProduct(product.id, { aplus_content: modules, ...(modules.length ? { content_mode: "aplus" as const } : {}) }),
    paths: [`/crm/products/${product.id}/edit`, `/supplier/portal/products/${product.id}`, "/products"],
  };
}

async function companyTarget(supplierId: string): Promise<Target | { error: string }> {
  const denied = await guard("suppliers.manage");
  if (denied) return { error: denied.message };
  const store = getStore();
  const supplier = await store.getSupplier(supplierId);
  if (!supplier) return { error: "Không tìm thấy nhà cung cấp." };
  return {
    supplierId: supplier.id, productId: null,
    before: readAplusModules(supplier.company_aplus, { supplierId: supplier.id, productId: COMPANY_APLUS_ID }),
    write: (modules) => store.updateSupplier(supplier.id, { company_aplus: modules }),
    paths: [`/crm/suppliers/${supplier.id}`, "/supplier/portal/storefront", ...(supplier.slug ? [`/suppliers/${supplier.slug}`] : [])],
  };
}

async function save(target: Target | { error: string }, modules: unknown, retranslate: string[]): Promise<StaffAplusResult> {
  if ("error" in target) return { ok: false, message: target.error };
  const session = await getSession();
  if (!session) return { ok: false, message: e.noAccess };
  const ctx = { supplierId: target.supplierId, productId: target.productId ?? COMPANY_APLUS_ID };
  try {
    const checked = await prepareAplusForSave(modules, ctx, ids(retranslate));
    if (!checked.ok) return { ok: false, message: checked.translation ? e.translation : problemText(checked.problem!) };
    if (aplusVideoLimitExceeded(checked.modules, target.before)) return { ok: false, message: fill(e.tooManyVideos, { max: APLUS_MAX_VIDEOS }) };
    const verified = await verifyAplusVideos(checked.modules, target.before, ctx);
    if (!verified.ok) return { ok: false, message: verified.index === null ? e.videoUnavailable : fill(e.videoMissing, { index: verified.index + 1 }) };
    await target.write(verified.modules);
    const kept = new Set(aplusImagePaths(verified.modules));
    await Promise.all(aplusImagePaths(target.before).filter((path) => !kept.has(path)).map((path) => deleteObject(path).catch(() => null)));
    const keptVideos = new Set(aplusVideoUids(verified.modules));
    const dropped = aplusVideoUids(target.before).filter((uid) => !keptVideos.has(uid));
    if (dropped.length) after(() => Promise.all(dropped.map(deleteStreamVideo)));
    await getStore().addAuditLog({ actor_id: session.uid, actor_email: session.email,
      entity: target.productId ? "product" : "supplier", entity_id: target.productId ?? target.supplierId,
      action: target.productId ? "staff.product_aplus_saved" : "staff.company_aplus_saved",
      before: { modules: target.before.length }, after: { modules: verified.modules.length, types: verified.modules.map((x) => x.type) } })
      .catch((error) => console.error("[crm-aplus] audit", error));
    for (const path of target.paths) revalidatePath(path, path === "/products" ? "layout" : undefined);
    return { ok: true, message: checked.translationFailed ? "Đã lưu và đăng. Một số khối chưa dịch được, lưu lại sau để dịch." : "Đã lưu và đăng nội dung A+.", modules: verified.modules };
  } catch (error) {
    console.error("[crm-aplus] save", error);
    return { ok: false, message: e.failed };
  }
}

async function preview(target: Target | { error: string }, modules: unknown, retranslate: string[]): Promise<StaffAplusResult> {
  if ("error" in target) return { ok: false, message: target.error };
  try {
    const draft = validateAplusModules(modules, { supplierId: target.supplierId, productId: target.productId ?? COMPANY_APLUS_ID }, { draft: true });
    if (!draft.ok) return { ok: false, message: problemText(draft.problem) };
    if (!aplusTranslationConfigured()) return { ok: false, message: e.translation };
    return { ok: true, message: aplusMessages.vi.translated, modules: await translateAplusModules(draft.modules, ids(retranslate)) };
  } catch (error) {
    console.error("[crm-aplus] translate preview", error);
    return { ok: false, message: e.translation };
  }
}

export async function saveStaffProductAplusAction(productId: string, modules: unknown, retranslate: string[] = []) {
  return save(await productTarget(productId), modules, retranslate);
}
export async function translateStaffProductAplusAction(productId: string, modules: unknown, retranslate: string[] = []) {
  return preview(await productTarget(productId), modules, retranslate);
}
export async function saveStaffCompanyAplusAction(supplierId: string, modules: unknown, retranslate: string[] = []) {
  return save(await companyTarget(supplierId), modules, retranslate);
}
export async function translateStaffCompanyAplusAction(supplierId: string, modules: unknown, retranslate: string[] = []) {
  return preview(await companyTarget(supplierId), modules, retranslate);
}
