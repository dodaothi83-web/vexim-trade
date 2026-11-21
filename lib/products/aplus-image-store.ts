import "server-only";

import { randomUUID } from "node:crypto";

import { prepareSupplierProductImage } from "@/lib/media/prepare-supplier-product-image";
import { deleteObject, getObject, putObject } from "@/lib/media/storage";
import { aplusImageFiles, aplusThumbPath } from "@/lib/products/aplus";

/**
 * Lưu trữ ảnh A+ dùng chung một cách xử lý với ảnh sản phẩm (prepareSupplierProductImage):
 * WebP tối đa 1600px, bỏ EXIF, kèm bản nhỏ 640px để ô nhỏ trên trang người mua tải nhẹ.
 * Ảnh chính và bản nhỏ luôn đi cùng nhau: tải lên, chép và xoá đều xử lý cả hai tệp.
 */
export type StoreAplusImageResult = { ok: true; path: string } | { ok: false; reason: "image" | "upload" };

/** `folder` là thư mục A+ của đúng chỗ dùng ảnh, ví dụ `aplus/<nhà cung cấp>/<sản phẩm | company | pending>`. */
export async function storeAplusImage(folder: string, bytes: Uint8Array): Promise<StoreAplusImageResult> {
  let prepared: Awaited<ReturnType<typeof prepareSupplierProductImage>>;
  try {
    prepared = await prepareSupplierProductImage(bytes);
  } catch (error) {
    console.error("[aplus-image] prepare", error);
    return { ok: false, reason: "image" };
  }
  const path = `${folder.replace(/\/+$/, "")}/${randomUUID()}.webp`;
  const thumb = aplusThumbPath(path)!;
  try {
    await putObject(path, prepared.main, "image/webp");
  } catch (error) {
    console.error("[aplus-image] upload", error);
    return { ok: false, reason: "upload" };
  }
  try {
    await putObject(thumb, prepared.thumb, "image/webp");
  } catch (error) {
    // Không để lại ảnh chính thiếu bản nhỏ: trang người mua dựa vào bản nhỏ cho ô nhỏ.
    console.error("[aplus-image] thumb upload", error);
    await deleteObject(path).catch(() => null);
    return { ok: false, reason: "upload" };
  }
  return { ok: true, path };
}

/** Chép một ảnh A+ (kèm bản nhỏ) sang đường dẫn mới. Trả false nếu thiếu tệp nguồn. */
export async function copyAplusImage(from: string, to: string): Promise<boolean> {
  const sources = aplusImageFiles(from);
  const targets = aplusImageFiles(to);
  if (sources.length !== targets.length) return false;
  for (const [index, source] of sources.entries()) {
    const object = await getObject(source).catch(() => null);
    if (!object) return false;
    await putObject(targets[index], object.data, mimeOf(source));
  }
  return true;
}

/** Xoá ảnh A+ không còn dùng, gồm cả bản nhỏ. Lỗi xoá không làm hỏng thao tác lưu. */
export async function deleteAplusImages(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.flatMap(aplusImageFiles).map((path) => deleteObject(path).catch(() => null)));
}

function mimeOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg";
}
