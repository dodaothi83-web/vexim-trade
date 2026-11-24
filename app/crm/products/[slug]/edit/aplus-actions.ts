"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { guard, getSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { deleteStreamVideo } from "@/lib/media/cloudflare-stream";
import { deleteAplusImages } from "@/lib/products/aplus-image-store";
import { aplusImagePaths, aplusVideoUids, readAplusModules, readGalleryVideo } from "@/lib/products/aplus";
import { productGate } from "@/lib/auth/supplier-access";
import { revalidatePublicCatalog } from "@/lib/public/revalidate-public";

/** Nhân viên gỡ một khối A+ vi phạm (liên hệ trực tiếp, nội dung sai...). Ghi nhật ký. */
export async function removeAplusModuleAction(productId: string, moduleId: string): Promise<{ ok: boolean; message: string }> {
  const denied = (await guard("products.manage")) ?? (await productGate(productId));
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
  await deleteAplusImages(aplusImagePaths([removed]).filter((p) => !kept.has(p)));
  const keptVideos = new Set(aplusVideoUids(next));
  const droppedVideos = aplusVideoUids([removed]).filter((uid) => !keptVideos.has(uid));
  if (droppedVideos.length) after(() => Promise.all(droppedVideos.map(deleteStreamVideo)));
  await store.addAuditLog({ actor_id: session.uid, actor_email: session.email, entity: "product", entity_id: productId,
    action: "staff.product_aplus_removed", before: { module: removed }, after: { modules: next.length } })
    .catch((error) => console.error("[crm-aplus] audit", error));
  revalidatePath(`/crm/products/${productId}/edit`);
  revalidatePublicCatalog();
  revalidatePath("/products", "layout");
  return { ok: true, message: "Đã gỡ khối A+." };
}

/** Nhân viên gỡ video sản phẩm (trong dãy ảnh) vi phạm; video bị xoá trên Cloudflare. Ghi nhật ký. */
export async function removeGalleryVideoAction(productId: string): Promise<{ ok: boolean; message: string }> {
  const denied = (await guard("products.manage")) ?? (await productGate(productId));
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
  revalidatePublicCatalog();
  revalidatePath("/products", "layout");
  return { ok: true, message: "Đã gỡ video." };
}
