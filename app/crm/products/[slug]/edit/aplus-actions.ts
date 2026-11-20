"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { deleteStreamVideo } from "@/lib/media/cloudflare-stream";
import { deleteObject } from "@/lib/media/storage";
import { APLUS_MAX_MODULES, aplusImagePaths, aplusVideoUids, readAplusModules, readGalleryVideo, validateAplusModules } from "@/lib/products/aplus";
import { verifyAplusVideos } from "@/lib/products/aplus-server";
import { fill } from "@/lib/i18n/format";
import { aplusMessages } from "@/lib/i18n/portal/aplus";
import { activeDesignConsent } from "@/lib/supplier-portal/storefront-design";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";

/** Nhân viên gỡ một khối A+ vi phạm (liên hệ trực tiếp, nội dung sai...). Ghi nhật ký. */
export async function removeAplusModuleAction(productId: string, moduleId: string): Promise<{ ok: boolean; message: string }> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  const store = getStore();
  const product = await store.getProduct(productId);
  if (!product || !session) return { ok: false, message: "Không tìm thấy sản phẩm." };
  const ctx = { supplierId: product.supplier_id, productId };
  const modules = readAplusModules(product.aplus_content, ctx);
  const removed = modules.find((m) => m.id === moduleId);
  if (!removed) return { ok: false, message: "Khối đã được gỡ hoặc đã thay đổi. Tải lại trang." };
  const next = modules.filter((m) => m.id !== moduleId);
  try {
    await store.updateProduct(productId, { aplus_content: next });
  } catch (error) {
    console.error("[crm-aplus] remove", error);
    return { ok: false, message: "Chưa gỡ được khối. Thử lại sau ít phút." };
  }
  const kept = new Set(aplusImagePaths(next));
  await Promise.all(aplusImagePaths([removed]).filter((p) => !kept.has(p)).map((p) => deleteObject(p).catch(() => null)));
  const keptVideos = new Set(aplusVideoUids(next));
  const droppedVideos = aplusVideoUids([removed]).filter((uid) => !keptVideos.has(uid));
  if (droppedVideos.length) after(() => Promise.all(droppedVideos.map(deleteStreamVideo)));
  await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "product", entity_id: productId,
    action: "staff.product_aplus_removed", before: { module: removed }, after: { modules: next.length } })
    .catch((error) => console.error("[crm-aplus] audit", error));
  revalidatePath(`/crm/products/${productId}/edit`);
  revalidatePath("/products", "layout");
  return { ok: true, message: "Đã gỡ khối A+." };
}

/** Nhân viên gỡ video sản phẩm (trong dãy ảnh) vi phạm; video bị xoá trên Cloudflare. Ghi nhật ký. */
export async function removeGalleryVideoAction(productId: string): Promise<{ ok: boolean; message: string }> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  const store = getStore();
  const product = await store.getProduct(productId);
  if (!product || !session) return { ok: false, message: "Không tìm thấy sản phẩm." };
  const video = readGalleryVideo(product.gallery_video);
  if (!video) return { ok: false, message: "Video đã được gỡ. Tải lại trang." };
  try {
    await store.updateProduct(productId, { gallery_video: null });
  } catch (error) {
    console.error("[crm-product-video] remove", error);
    return { ok: false, message: "Chưa gỡ được video. Thử lại sau ít phút." };
  }
  after(() => deleteStreamVideo(video.video_uid));
  await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "product", entity_id: productId,
    action: "staff.product_video_removed", before: { video: video.video_uid }, after: { video: null } })
    .catch((error) => console.error("[crm-product-video] audit", error));
  revalidatePath(`/crm/products/${productId}/edit`);
  revalidatePath("/products", "layout");
  return { ok: true, message: "Đã gỡ video." };
}

/**
 * Nhân viên lưu nội dung A+ thay nhà cung cấp (dịch vụ thiết kế bán ngoài hệ thống). Cần quyền
 * products.manage, đồng ý phạm vi "Trang + A+" đang hiệu lực và gói còn quyền A+. Cùng kiểm tra
 * nội dung như khi nhà cung cấp tự lưu; ghi nhật ký kèm mã đồng ý.
 */
export async function staffSaveAplusAction(productId: string, raw: unknown): Promise<{ ok: boolean; message: string }> {
  const denied = await guard("products.manage");
  if (denied) return { ok: false, message: denied.message };
  const session = await getSession();
  const store = getStore();
  const product = await store.getProduct(productId);
  if (!product || !session) return { ok: false, message: "Không tìm thấy sản phẩm." };
  const supplier = await store.getSupplier(product.supplier_id);
  if (!supplier || !supplierPlanRules(supplier, new Date(), await readPlanCatalog()).richContent) return { ok: false, message: "Gói nhà cung cấp không có nội dung A+." };
  const consent = await activeDesignConsent(supplier.id);
  if (consent?.scope !== "storefront_aplus") return { ok: false, message: "Chưa ghi nhận đồng ý sửa hộ nội dung A+." };
  const ctx = { supplierId: product.supplier_id, productId };
  const checked = validateAplusModules(raw, ctx);
  if (!checked.ok) {
    const e = aplusMessages.vi.errors;
    const { problem } = checked;
    if (problem.code === "tooMany") return { ok: false, message: fill(e.tooMany, { max: APLUS_MAX_MODULES }) };
    return { ok: false, message: fill(e[problem.code === "video" ? "videoMissing" : problem.code], { index: problem.index + 1 }) };
  }
  const before = readAplusModules(product.aplus_content, ctx);
  const verified = await verifyAplusVideos(checked.modules, before, ctx);
  if (!verified.ok) return { ok: false, message: verified.index === null ? aplusMessages.vi.errors.videoUnavailable : fill(aplusMessages.vi.errors.videoMissing, { index: verified.index + 1 }) };
  try {
    await store.updateProduct(productId, { aplus_content: verified.modules });
  } catch (error) {
    console.error("[crm-aplus] staff save", error);
    return { ok: false, message: "Chưa lưu được nội dung A+." };
  }
  const keptImages = new Set(aplusImagePaths(verified.modules));
  await Promise.all(aplusImagePaths(before).filter((p) => !keptImages.has(p)).map((p) => deleteObject(p).catch(() => null)));
  const keptVideos = new Set(aplusVideoUids(verified.modules));
  const droppedVideos = aplusVideoUids(before).filter((uid) => !keptVideos.has(uid));
  if (droppedVideos.length) after(() => Promise.all(droppedVideos.map(deleteStreamVideo)));
  await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "product", entity_id: productId,
    action: "staff.product_aplus_saved", before: { modules: before.length }, after: { modules: verified.modules.length, consent_id: consent.id } })
    .catch((error) => console.error("[crm-aplus] audit", error));
  revalidatePath(`/crm/products/${productId}/edit`);
  revalidatePath(`/supplier/portal/products/${productId}`);
  revalidatePath("/products", "layout");
  return { ok: true, message: "Đã lưu nội dung A+ thay nhà cung cấp. Người mua thấy ngay." };
}
