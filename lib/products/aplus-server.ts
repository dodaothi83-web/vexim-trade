/**
 * Kiểm tra video trong nội dung A+ phía máy chủ, dùng chung cho nhà cung cấp và CRM sửa hộ.
 */
import { getStreamVideo, streamConfig } from "@/lib/media/cloudflare-stream";
import type { AplusModule } from "@/lib/products/aplus";

/**
 * Video mới phải là video Vexim xin tải lên cho đúng sản phẩm này (meta.product_id do máy chủ
 * gắn khi xin đường tải lên), để không ai dán mã video của nơi khác. Video đã lưu trước đó không
 * kiểm tra lại. Thời lượng và ngày tải lên luôn lấy từ Cloudflare (dữ liệu SEO VideoObject), không
 * lấy từ trình duyệt; video còn đang xử lý thì lần lưu sau sẽ bổ sung thời lượng.
 */
export async function verifyAplusVideos(modules: AplusModule[], before: AplusModule[], ctx: { supplierId: string; productId: string }):
  Promise<{ ok: true; modules: AplusModule[] } | { ok: false; index: number | null }> {
  const known = new Map(before.flatMap((m) => m.type === "video" ? [[m.video_uid, m] as const] : []));
  const out: AplusModule[] = [];
  for (let index = 0; index < modules.length; index++) {
    const module = modules[index];
    if (module.type !== "video") { out.push(module); continue; }
    const old = known.get(module.video_uid);
    const base = { id: module.id, type: "video" as const, video_uid: module.video_uid, title: module.title };
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
