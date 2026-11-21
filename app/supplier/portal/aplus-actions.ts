"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { deleteStreamVideo, getStreamVideo, streamConfig } from "@/lib/media/cloudflare-stream";
import { deleteObject } from "@/lib/media/storage";
import { aplusTranslationConfigured, translateAplusModules } from "@/lib/ai/translate-aplus";
import { APLUS_MAX_MODULES, aplusImagePaths, aplusVideoUids, canEditAplus, readAplusModules, readGalleryVideo, validateAplusModules,
  type AplusModule, type AplusProblem, type ProductGalleryVideo } from "@/lib/products/aplus";
import { prepareAplusForSave } from "@/lib/products/aplus-server";
import { PENDING_PRODUCT_ID } from "@/lib/supplier-portal/pending-media";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";

export type AplusSaveResult = { ok: boolean; message: string; modules?: AplusModule[] };

/**
 * Lưu nội dung A+ của một sản phẩm. Danh tính và quyền gói lấy từ phiên đăng nhập; lưu là hiện
 * ngay cho người mua (Vexim có thể gỡ khối vi phạm trong CRM). Ảnh bị bỏ khỏi nội dung thì xoá tệp.
 */
export async function saveProductAplusAction(productId: string, modules: unknown, retranslate: string[] = []): Promise<AplusSaveResult> {
  const { m } = await getPortalMessages();
  const e = m.aplus.errors;
  try {
    const access = await supplierPortalAccess();
    if (!access || !portalApproved(access.supplier)) return { ok: false, message: e.noAccess };
    const product = await access.store.getProduct(productId);
    if (!product || product.supplier_id !== access.supplier.id || !canEditAplus(product)) return { ok: false, message: e.noAccess };
    if (!supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).richContent) return { ok: false, message: e.plan };
    const ctx = { supplierId: access.supplier.id, productId };
    // Viết tiếng Việt, máy chủ dịch các khối có thay đổi rồi kiểm tra bản tiếng Anh người mua thấy.
    const checked = await prepareAplusForSave(modules, ctx, new Set(retranslate.filter((id) => typeof id === "string").slice(0, APLUS_MAX_MODULES)));
    if (!checked.ok) return { ok: false, message: checked.translation ? e.translation : aplusProblemText(checked.problem!, e) };
    const before = readAplusModules(product.aplus_content, ctx);
    const previous = aplusImagePaths(before);
    const verified = await verifyVideos(checked.modules, before, ctx);
    if (!verified.ok) return { ok: false, message: verified.index === null ? e.videoUnavailable : fill(e.videoMissing, { index: verified.index + 1 }) };
    await access.store.updateProduct(productId, { aplus_content: verified.modules });
    const kept = new Set(aplusImagePaths(verified.modules));
    await Promise.all(previous.filter((path) => !kept.has(path)).map((path) => deleteObject(path).catch(() => null)));
    // Video bị bỏ khỏi nội dung thì xoá trên Cloudflare (chạy sau khi trả lời, không làm chậm nút Lưu).
    const keptVideos = new Set(aplusVideoUids(verified.modules));
    const droppedVideos = aplusVideoUids(before).filter((uid) => !keptVideos.has(uid));
    if (droppedVideos.length) after(() => Promise.all(droppedVideos.map(deleteStreamVideo)));
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email, entity: "product", entity_id: productId,
      action: "supplier.product_aplus_saved", before: { modules: previous.length }, after: { modules: verified.modules.length, types: verified.modules.map((x) => x.type) } })
      .catch((error) => console.error("[aplus] audit", error));
    revalidatePath(`/supplier/portal/products/${productId}`);
    revalidatePath("/products", "layout");
    return { ok: true, message: checked.translationFailed ? m.aplus.savedTranslateLater : m.aplus.saved, modules: verified.modules };
  } catch (error) {
    console.error("[aplus] save", error);
    return { ok: false, message: e.failed };
  }
}

/**
 * Dịch thử để xem trước bản tiếng Anh (nút "Dịch ngay" và "Dịch lại từ tiếng Việt"), không lưu.
 * Sản phẩm chưa tạo (`productId` null) thì ảnh nằm ở khu chờ của nhà cung cấp.
 */
export async function translateAplusPreviewAction(productId: string | null, modules: unknown, retranslate: string[] = []): Promise<AplusSaveResult> {
  const { m } = await getPortalMessages();
  const e = m.aplus.errors;
  try {
    const access = await supplierPortalAccess();
    if (!access || !portalApproved(access.supplier)) return { ok: false, message: e.noAccess };
    if (productId) {
      const product = await access.store.getProduct(productId);
      if (!product || product.supplier_id !== access.supplier.id) return { ok: false, message: e.noAccess };
    }
    if (!supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).richContent) return { ok: false, message: e.plan };
    const ctx = { supplierId: access.supplier.id, productId: productId ?? PENDING_PRODUCT_ID };
    const draft = validateAplusModules(modules, ctx, { draft: true });
    if (!draft.ok) return { ok: false, message: aplusProblemText(draft.problem, e) };
    if (!aplusTranslationConfigured()) return { ok: false, message: e.translation };
    const translated = await translateAplusModules(draft.modules, new Set(retranslate.filter((id) => typeof id === "string").slice(0, APLUS_MAX_MODULES)));
    return { ok: true, message: m.aplus.translated, modules: translated };
  } catch (error) {
    console.error("[aplus] translate preview", error);
    return { ok: false, message: e.translation };
  }
}

function aplusProblemText(problem: AplusProblem, e: Awaited<ReturnType<typeof getPortalMessages>>["m"]["aplus"]["errors"]): string {
  if (problem.code === "tooMany") return fill(e.tooMany, { max: APLUS_MAX_MODULES });
  const key = problem.code === "video" ? "videoMissing" : problem.code;
  return fill(e[key], { index: problem.index + 1 });
}

/**
 * Video sản phẩm trong dãy ảnh (Premium/Pro): lưu ngay sau khi tải lên, hoặc xoá khi `videoUid`
 * là null. Video mới phải là video Vexim xin tải lên cho đúng sản phẩm; video cũ bị thay thì xoá
 * trên Cloudflare. Xoá video luôn được, kể cả khi gói đã hết quyền.
 */
export async function saveProductVideoAction(productId: string, videoUid: string | null): Promise<AplusSaveResult> {
  const { m } = await getPortalMessages();
  const e = m.aplus.errors, v = m.aplus.productVideo;
  try {
    const access = await supplierPortalAccess();
    if (!access || !portalApproved(access.supplier)) return { ok: false, message: e.noAccess };
    const product = await access.store.getProduct(productId);
    if (!product || product.supplier_id !== access.supplier.id || !canEditAplus(product)) return { ok: false, message: e.noAccess };
    const before = readGalleryVideo(product.gallery_video);
    let next: ProductGalleryVideo | null = null;
    if (videoUid !== null) {
      if (!supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).video) return { ok: false, message: v.plan };
      if (typeof videoUid !== "string" || !/^[a-f0-9]{32}$/i.test(videoUid)) return { ok: false, message: v.invalid };
      const uid = videoUid.toLowerCase();
      if (uid === before?.video_uid) return { ok: true, message: v.saved };
      if (!streamConfig()) return { ok: false, message: e.videoUnavailable };
      const video = await getStreamVideo(uid);
      if (!video || video.meta.product_id !== productId || (video.creator && video.creator !== access.supplier.id) || video.state === "error")
        return { ok: false, message: v.invalid };
      next = { video_uid: uid, ...(video.duration ? { duration: Math.round(video.duration) } : {}), ...(video.uploaded ? { uploaded_at: video.uploaded } : {}) };
    }
    await access.store.updateProduct(productId, { gallery_video: next });
    if (before && before.video_uid !== next?.video_uid) after(() => deleteStreamVideo(before.video_uid));
    await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email, entity: "product", entity_id: productId,
      action: next ? "supplier.product_video_saved" : "supplier.product_video_removed", before: { video: before?.video_uid ?? null }, after: { video: next?.video_uid ?? null } })
      .catch((error) => console.error("[product-video] audit", error));
    revalidatePath(`/supplier/portal/products/${productId}`);
    revalidatePath("/products", "layout");
    return { ok: true, message: next ? v.saved : v.removed };
  } catch (error) {
    console.error("[product-video] save", error);
    return { ok: false, message: e.failed };
  }
}

/**
 * Video mới phải là video Vexim xin tải lên cho đúng sản phẩm này (meta.product_id do máy chủ
 * gắn khi xin đường tải lên), để không ai dán mã video của nơi khác. Video đã lưu trước đó không
 * kiểm tra lại. Thời lượng và ngày tải lên luôn lấy từ Cloudflare (dữ liệu SEO VideoObject), không
 * lấy từ trình duyệt; video còn đang xử lý thì lần lưu sau sẽ bổ sung thời lượng.
 */
async function verifyVideos(modules: AplusModule[], before: AplusModule[], ctx: { supplierId: string; productId: string }):
  Promise<{ ok: true; modules: AplusModule[] } | { ok: false; index: number | null }> {
  const known = new Map(before.flatMap((m) => m.type === "video" ? [[m.video_uid, m] as const] : []));
  const out: AplusModule[] = [];
  for (let index = 0; index < modules.length; index++) {
    const module = modules[index];
    if (module.type !== "video") { out.push(module); continue; }
    const old = known.get(module.video_uid);
    const { duration: _d, uploaded_at: _u, ...rest } = module;
    void _d; void _u;
    const base = rest;
    const keepOld = () => ({ ...base, ...(old?.type === "video" && old.duration ? { duration: old.duration } : {}),
      ...(old?.type === "video" && old.uploaded_at ? { uploaded_at: old.uploaded_at } : {}) });
    if (old?.type === "video" && old.duration && old.uploaded_at) { out.push(keepOld()); continue; }
    if (!streamConfig()) {
      if (old) { out.push(keepOld()); continue; }
      return { ok: false, index: null };
    }
    let video;
    try { video = await getStreamVideo(module.video_uid); } catch (error) {
      console.error("[aplus] stream verify", error);
      if (old) { out.push(keepOld()); continue; }
      return { ok: false, index: null };
    }
    if (!old && (!video || video.meta.product_id !== ctx.productId || (video.creator && video.creator !== ctx.supplierId) ||
        video.state === "error")) return { ok: false, index };
    out.push({ ...base, ...(video?.duration ? { duration: Math.round(video.duration) } : {}),
      ...(video?.uploaded ? { uploaded_at: video.uploaded } : {}) });
  }
  return { ok: true, modules: out };
}

/**
 * Chọn nội dung hiển thị trên trang sản phẩm: "basic" (mô tả chữ, mặc định) hoặc "aplus" (cần gói
 * có A+). Cùng điều kiện sửa với nội dung A+; không đổi trạng thái duyệt, giá hay dữ liệu khác.
 */
export async function saveProductContentModeAction(productId: string, mode: "basic" | "aplus"): Promise<{ ok: boolean; message: string }> {
  const { m } = await getPortalMessages();
  const e = m.aplus.errors;
  try {
    if (mode !== "basic" && mode !== "aplus") return { ok: false, message: e.failed };
    const access = await supplierPortalAccess();
    if (!access || !portalApproved(access.supplier)) return { ok: false, message: e.noAccess };
    const product = await access.store.getProduct(productId);
    if (!product || product.supplier_id !== access.supplier.id || !canEditAplus(product)) return { ok: false, message: e.noAccess };
    if (mode === "aplus" && !supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).richContent) return { ok: false, message: e.plan };
    if ((product.content_mode ?? "basic") !== mode) {
      await access.store.updateProduct(productId, { content_mode: mode });
      await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email, entity: "product", entity_id: productId,
        action: "supplier.product_content_mode", before: { mode: product.content_mode ?? null }, after: { mode } })
        .catch((error) => console.error("[aplus] audit mode", error));
      revalidatePath(`/supplier/portal/products/${productId}`);
      revalidatePath("/products", "layout");
    }
    return { ok: true, message: mode === "aplus" ? m.aplus.contentTabs.showingAplus : m.aplus.contentTabs.showingBasic };
  } catch (error) {
    console.error("[aplus] content mode", error);
    return { ok: false, message: e.failed };
  }
}
