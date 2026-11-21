/**
 * Ảnh A+ và video tải lên khi sản phẩm mới chưa được lưu lần đầu (giống cách Shopee cho đăng
 * video ngay khi tạo sản phẩm).
 *
 * - Tải lên: ảnh nằm ở `aplus/<supplierId>/pending/<uuid>.webp` (kèm bản nhỏ `-thumb.webp`), video Cloudflare mang meta
 *   `pending` và `supplier_id`. Mỗi tệp ghi một dòng trong `supplier_pending_uploads`.
 * - Lưu sản phẩm: ảnh được chép sang thư mục sản phẩm, video được kiểm tra đúng chủ rồi gắn mã
 *   sản phẩm; dòng chờ bị xoá.
 * - Bỏ ngang: tệp chờ quá 24 giờ bị xoá bởi cleanupPendingUploads (cron).
 */
import { getSupabaseClient } from "@/lib/db/supabase";
import { deleteStreamVideo, getStreamVideo, setStreamVideoMeta, streamConfig } from "@/lib/media/cloudflare-stream";
import { copyAplusImage, deleteAplusImages } from "@/lib/products/aplus-image-store";
import { aplusImagePaths, mapAplusImages, validateAplusModules, type AplusModule, type AplusProblem, type ProductGalleryVideo } from "@/lib/products/aplus";

export const PENDING_PRODUCT_ID = "pending";
/** Tối đa số tệp chờ mỗi nhà cung cấp trong 24 giờ, chặn tải lên vô hạn. */
export const PENDING_UPLOADS_PER_DAY = 80;
const PENDING_TTL_HOURS = 24;
const TABLE = "supplier_pending_uploads";
/** Thư mục ảnh A+ chờ của một nhà cung cấp. */
export function pendingImageFolder(supplierId: string): string {
  return `aplus/${supplierId}/${PENDING_PRODUCT_ID}`;
}

export async function registerPendingUpload(supplierId: string, kind: "image" | "video", ref: string): Promise<void> {
  const db = getSupabaseClient();
  if (!db) return;
  const { error } = await db.from(TABLE).insert({ supplier_id: supplierId, kind, ref });
  if (error) console.error("[pending-media] register", error);
}

export async function countRecentPendingUploads(supplierId: string): Promise<number> {
  const db = getSupabaseClient();
  if (!db) return 0;
  const since = new Date(Date.now() - PENDING_TTL_HOURS * 3_600_000).toISOString();
  const { count, error } = await db.from(TABLE).select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId).gte("created_at", since);
  if (error) { console.error("[pending-media] count", error); return 0; }
  return count ?? 0;
}

async function releasePendingUploads(supplierId: string, refs: string[]): Promise<void> {
  const db = getSupabaseClient();
  if (!db || !refs.length) return;
  const { error } = await db.from(TABLE).delete().eq("supplier_id", supplierId).in("ref", refs);
  if (error) console.error("[pending-media] release", error);
}

/** Video chờ phải do chính nhà cung cấp này tải lên qua Vexim và chưa gắn sản phẩm nào. */
async function verifyPendingVideo(uid: string, supplierId: string): Promise<{ duration?: number; uploaded_at?: string } | null> {
  if (!streamConfig()) return null;
  const video = await getStreamVideo(uid);
  if (!video || video.state === "error" || video.meta.supplier_id !== supplierId || video.meta.pending !== "true" ||
      (video.creator && video.creator !== supplierId)) return null;
  return { ...(video.duration ? { duration: Math.round(video.duration) } : {}), ...(video.uploaded ? { uploaded_at: video.uploaded } : {}) };
}

export type PendingMediaInput = { aplus: AplusModule[]; videoUid: string | null };

/**
 * Đọc A+ và video chờ từ form tạo sản phẩm. Kiểm tra cấu trúc trước khi tạo sản phẩm để báo lỗi
 * sớm (sai ngôn ngữ, thiếu tiêu đề...). Không có gì thì trả rỗng.
 */
export function readPendingMediaForm(form: FormData, supplierId: string):
  { ok: true; value: PendingMediaInput } | { ok: false; problem: AplusProblem } | { ok: false; problem: null } {
  const rawAplus = form.get("pending_aplus_json");
  const rawVideo = form.get("pending_video_uid");
  let aplus: AplusModule[] = [];
  if (typeof rawAplus === "string" && rawAplus.trim() && rawAplus.trim() !== "[]") {
    if (rawAplus.length > 120_000) return { ok: false, problem: { code: "tooMany" } };
    let parsed: unknown;
    try { parsed = JSON.parse(rawAplus); } catch { return { ok: false, problem: { code: "invalid", index: 0 } }; }
    // Bản nháp (tiếng Việt); máy chủ dịch và kiểm tra bản tiếng Anh trước khi tạo sản phẩm.
    const checked = validateAplusModules(parsed, { supplierId, productId: PENDING_PRODUCT_ID }, { draft: true });
    if (!checked.ok) return checked;
    aplus = checked.modules;
  }
  const videoUid = typeof rawVideo === "string" && /^[a-f0-9]{32}$/i.test(rawVideo.trim()) ? rawVideo.trim().toLowerCase() : null;
  if (typeof rawVideo === "string" && rawVideo.trim() && !videoUid) return { ok: false, problem: null };
  return { ok: true, value: { aplus, videoUid } };
}

/**
 * Gắn A+ và video chờ vào sản phẩm vừa tạo. Trả `false` nếu có phần không gắn được (sản phẩm
 * vẫn được tạo; nhà cung cấp thêm lại trong trang sửa sản phẩm).
 */
export async function attachPendingMedia(input: PendingMediaInput, ctx: {
  supplierId: string;
  productId: string;
  updateProduct: (patch: { aplus_content?: AplusModule[]; gallery_video?: ProductGalleryVideo | null }) => Promise<unknown>;
}): Promise<boolean> {
  const { supplierId, productId } = ctx;
  let complete = true;
  const released: string[] = [];
  const patch: { aplus_content?: AplusModule[]; gallery_video?: ProductGalleryVideo | null } = {};

  if (input.videoUid) {
    try {
      const meta = await verifyPendingVideo(input.videoUid, supplierId);
      if (meta) {
        patch.gallery_video = { video_uid: input.videoUid, ...meta };
        released.push(input.videoUid);
      } else complete = false;
    } catch (error) {
      console.error("[pending-media] verify video", error);
      complete = false;
    }
  }

  if (input.aplus.length) {
    const moved = new Map<string, string>();
    const modules: AplusModule[] = [];
    for (const module of input.aplus) {
      try {
        if (module.type === "video") {
          const meta = await verifyPendingVideo(module.video_uid, supplierId);
          if (!meta) { complete = false; continue; }
          modules.push({ ...module, ...meta });
          released.push(module.video_uid);
          continue;
        }
        let failed = false;
        for (const from of aplusImagePaths([module])) {
          if (moved.has(from)) continue;
          const to = `aplus/${supplierId}/${productId}/${from.split("/").pop()}`;
          // Chép cả bản nhỏ 640px đi cùng ảnh chính.
          if (!await copyAplusImage(from, to)) { failed = true; break; }
          moved.set(from, to);
        }
        if (failed) { complete = false; continue; }
        const swap = (path: string) => moved.get(path) ?? path;
        modules.push(mapAplusImages(module, swap));
      } catch (error) {
        console.error("[pending-media] attach module", error);
        complete = false;
      }
    }
    if (modules.length) patch.aplus_content = modules;
    // Ảnh chờ đã chép xong thì xoá bản tạm.
    released.push(...moved.keys());
    await deleteAplusImages([...moved.keys()]);
  }

  if (patch.aplus_content || patch.gallery_video) {
    try {
      await ctx.updateProduct(patch);
    } catch (error) {
      console.error("[pending-media] update product", error);
      return false;
    }
    for (const uid of [patch.gallery_video?.video_uid, ...(patch.aplus_content ?? []).flatMap((m) => m.type === "video" ? [m.video_uid] : [])])
      if (uid) await setStreamVideoMeta(uid, { name: `vexim-product-${productId}`, product_id: productId, supplier_id: supplierId });
  }
  await releasePendingUploads(supplierId, released);
  return complete;
}

/** Xoá tệp chờ quá 24 giờ (sản phẩm không được lưu). Gọi từ cron. */
export async function cleanupPendingUploads(): Promise<{ images: number; videos: number; errors: number }> {
  const db = getSupabaseClient();
  const result = { images: 0, videos: 0, errors: 0 };
  if (!db) return result;
  const before = new Date(Date.now() - PENDING_TTL_HOURS * 3_600_000).toISOString();
  const { data, error } = await db.from(TABLE).select("id, kind, ref").lt("created_at", before).limit(500);
  if (error) { console.error("[pending-media] cleanup list", error); result.errors++; return result; }
  for (const row of (data ?? []) as Array<{ id: string; kind: string; ref: string }>) {
    try {
      if (row.kind === "video") { await deleteStreamVideo(row.ref); result.videos++; }
      else if (row.ref.split("/")[2] === PENDING_PRODUCT_ID) { await deleteAplusImages([row.ref]); result.images++; }
      await db.from(TABLE).delete().eq("id", row.id);
    } catch (cleanupError) {
      console.error("[pending-media] cleanup", row.ref, cleanupError);
      result.errors++;
    }
  }
  return result;
}
