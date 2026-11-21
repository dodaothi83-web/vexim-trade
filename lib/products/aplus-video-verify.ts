import "server-only";

import { getStreamVideo, streamConfig } from "@/lib/media/cloudflare-stream";
import { COMPANY_APLUS_ID, type AplusModule } from "@/lib/products/aplus";

/**
 * Kiểm tra video trong nội dung A+ trước khi đăng. Video mới phải là video Vexim xin tải lên cho
 * đúng chỗ: A+ sản phẩm (meta product_id) hoặc A+ doanh nghiệp (meta purpose "company" và đúng nhà
 * cung cấp). Video đã có trước đó giữ thời lượng, ngày tải lên cũ. Dùng chung cho nhà cung cấp lưu,
 * và cho nhà cung cấp duyệt bản nháp nhân viên Vexim soạn.
 */
export async function verifyAplusVideos(modules: AplusModule[], before: AplusModule[], ctx: { supplierId: string; productId: string }):
  Promise<{ ok: true; modules: AplusModule[] } | { ok: false; index: number | null }> {
  const company = ctx.productId === COMPANY_APLUS_ID;
  const known = new Map(before.flatMap((m) => m.type === "video" ? [[m.video_uid, m] as const] : []));
  const out: AplusModule[] = [];
  for (let index = 0; index < modules.length; index++) {
    const module = modules[index];
    if (module.type !== "video") { out.push(module); continue; }
    const old = known.get(module.video_uid);
    const { duration: _d, uploaded_at: _u, ...base } = module;
    void _d; void _u;
    const keepOld = () => ({ ...base, ...(old?.type === "video" && old.duration ? { duration: old.duration } : {}),
      ...(old?.type === "video" && old.uploaded_at ? { uploaded_at: old.uploaded_at } : {}) });
    if (old?.type === "video" && old.duration && old.uploaded_at) { out.push(keepOld()); continue; }
    if (!streamConfig()) { if (old) { out.push(keepOld()); continue; } return { ok: false, index: null }; }
    let video;
    try { video = await getStreamVideo(module.video_uid); } catch (error) {
      console.error("[aplus] stream verify", error);
      if (old) { out.push(keepOld()); continue; }
      return { ok: false, index: null };
    }
    const wrongTarget = company
      ? video?.meta.purpose !== "company" || video?.meta.supplier_id !== ctx.supplierId
      : video?.meta.product_id !== ctx.productId;
    if (!old && (!video || wrongTarget || (video.creator && video.creator !== ctx.supplierId) || video.state === "error")) return { ok: false, index };
    out.push({ ...base, ...(video?.duration ? { duration: Math.round(video.duration) } : {}), ...(video?.uploaded ? { uploaded_at: video.uploaded } : {}) });
  }
  return { ok: true, modules: out };
}
