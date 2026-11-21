"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { aplusTranslationConfigured, translateAplusModules } from "@/lib/ai/translate-aplus";
import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { deleteStreamVideo } from "@/lib/media/cloudflare-stream";
import { deleteObject, getObject, putObject } from "@/lib/media/storage";
import {
  APLUS_MAX_MODULES, APLUS_MAX_VIDEOS, aplusVideoLimitExceeded, aplusImagePaths, aplusVideoUids, COMPANY_APLUS_ID, readAplusModules, validateAplusModules,
  type AplusModule, type AplusProblem,
} from "@/lib/products/aplus";
import { prepareAplusForSave } from "@/lib/products/aplus-server";
import { verifyAplusVideos } from "@/lib/products/aplus-video-verify";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { normalizeShowcaseBlocks } from "@/lib/supplier-showcase";

export type CompanyAplusResult = { ok: boolean; message: string; modules?: AplusModule[] };
type Messages = Awaited<ReturnType<typeof getPortalMessages>>["m"];

/**
 * A+ doanh nghiệp trên trang nhà cung cấp (gói có trang cao cấp): cùng khối, cùng luồng viết tiếng
 * Việt và dịch khi lưu như A+ sản phẩm. Danh tính và quyền gói lấy từ phiên đăng nhập; lưu là hiện
 * ngay dưới mục About (Vexim gỡ được khối vi phạm trong CRM). Phần xác minh, chứng nhận, điều kiện
 * giao dịch không nằm trong nội dung này.
 */
async function context() {
  const { m } = await getPortalMessages();
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return { m, error: m.aplus.errors.noAccess } as const;
  if (!supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).premiumStorefront) return { m, error: m.aplus.company.lockedTitle } as const;
  return { m, access, ctx: { supplierId: access.supplier.id, productId: COMPANY_APLUS_ID } } as const;
}

function problemText(problem: AplusProblem, m: Messages): string {
  const e = m.aplus.errors;
  if (problem.code === "tooMany") return fill(e.tooMany, { max: APLUS_MAX_MODULES });
  const key = problem.code === "video" ? "videoMissing" : problem.code;
  return fill(e[key], { index: problem.index + 1 });
}

const ids = (list: string[]) => new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === "string").slice(0, APLUS_MAX_MODULES));

export async function saveCompanyAplusAction(modules: unknown, retranslate: string[] = []): Promise<CompanyAplusResult> {
  const c = await context();
  if ("error" in c) return { ok: false, message: c.error ?? "" };
  const { m, access, ctx } = c;
  const e = m.aplus.errors;
  try {
    const checked = await prepareAplusForSave(modules, ctx, ids(retranslate));
    if (!checked.ok) return { ok: false, message: checked.translation ? e.translation : problemText(checked.problem!, m) };
    const before = readAplusModules(access.supplier.company_aplus, ctx);
    if (aplusVideoLimitExceeded(checked.modules, before)) return { ok: false, message: fill(e.tooManyVideos, { max: APLUS_MAX_VIDEOS }) };
    const verified = await verifyAplusVideos(checked.modules, before, ctx);
    if (!verified.ok) return { ok: false, message: verified.index === null ? e.videoUnavailable : fill(e.videoMissing, { index: verified.index + 1 }) };
    await access.store.updateSupplier(access.supplier.id, { company_aplus: verified.modules });
    // Ảnh, video bị bỏ khỏi nội dung thì xoá (video chạy sau khi trả lời, không làm chậm nút Lưu).
    const kept = new Set(aplusImagePaths(verified.modules));
    await Promise.all(aplusImagePaths(before).filter((path) => !kept.has(path)).map((path) => deleteObject(path).catch(() => null)));
    const keptVideos = new Set(aplusVideoUids(verified.modules));
    const dropped = aplusVideoUids(before).filter((uid) => !keptVideos.has(uid));
    if (dropped.length) after(() => Promise.all(dropped.map(deleteStreamVideo)));
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email, entity: "supplier", entity_id: access.supplier.id,
      action: "supplier.company_aplus_saved", before: { modules: before.length }, after: { modules: verified.modules.length, types: verified.modules.map((x) => x.type) } })
      .catch((error) => console.error("[company-aplus] audit", error));
    revalidatePath("/supplier/portal/storefront");
    revalidatePath("/supplier/portal/storefront/company");
    revalidatePath(`/suppliers/${access.supplier.slug || access.supplier.id}`);
    return { ok: true, message: checked.translationFailed ? m.aplus.savedTranslateLater : m.aplus.companySaved, modules: verified.modules };
  } catch (error) {
    console.error("[company-aplus] save", error);
    return { ok: false, message: e.failed };
  }
}

/** Dịch thử để xem trước bản tiếng Anh, không lưu. */
export async function translateCompanyAplusPreviewAction(modules: unknown, retranslate: string[] = []): Promise<CompanyAplusResult> {
  const c = await context();
  if ("error" in c) return { ok: false, message: c.error ?? "" };
  const { m, ctx } = c;
  try {
    const draft = validateAplusModules(modules, ctx, { draft: true });
    if (!draft.ok) return { ok: false, message: problemText(draft.problem, m) };
    if (!aplusTranslationConfigured()) return { ok: false, message: m.aplus.errors.translation };
    return { ok: true, message: m.aplus.translated, modules: await translateAplusModules(draft.modules, ids(retranslate)) };
  } catch (error) {
    console.error("[company-aplus] translate preview", error);
    return { ok: false, message: m.aplus.errors.translation };
  }
}

/**
 * Chuyển khối Showcase cũ (ảnh, tiêu đề, đoạn chữ tiếng Anh) thành khối "Ảnh + chữ" của A+ doanh
 * nghiệp: chép ảnh sang thư mục A+ doanh nghiệp, trả nội dung để nhà cung cấp kiểm tra rồi lưu.
 * Khối Showcase cũ giữ nguyên tới khi A+ doanh nghiệp được lưu (trang công khai ưu tiên A+).
 */
export async function migrateShowcaseToCompanyAplusAction(): Promise<CompanyAplusResult> {
  const c = await context();
  if ("error" in c) return { ok: false, message: c.error ?? "" };
  const { m, access } = c;
  const showcase = normalizeShowcaseBlocks(access.supplier.showcase_blocks).slice(0, APLUS_MAX_MODULES);
  if (!showcase.length) return { ok: false, message: m.aplus.errors.failed };
  const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  try {
    const modules: AplusModule[] = [];
    for (const [index, block] of showcase.entries()) {
      const ext = block.image_path.split(".").pop()?.toLowerCase() ?? "";
      const object = MIME[ext] ? await getObject(block.image_path).catch(() => null) : null;
      if (!object) continue;
      const path = `aplus/${access.supplier.id}/${COMPANY_APLUS_ID}/${randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
      await putObject(path, object.data, MIME[ext]);
      const module: AplusModule = { id: randomUUID(), type: "image_text", image_path: path, alt: block.title.slice(0, 160),
        title: block.title.slice(0, 120), body: block.body.slice(0, 1200), image_side: index % 2 ? "right" : "left" };
      // Nội dung Showcase vốn là tiếng Anh: giữ là khối viết thẳng tiếng Anh (sửa ở tab English, không dịch).
      modules.push(module);
    }
    if (!modules.length) return { ok: false, message: m.aplus.errors.upload };
    return { ok: true, message: m.aplus.company.migrated, modules };
  } catch (error) {
    console.error("[company-aplus] migrate showcase", error);
    return { ok: false, message: m.aplus.errors.failed };
  }
}

