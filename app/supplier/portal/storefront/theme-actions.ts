"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { aplusTranslationConfigured, translateAplusStrings } from "@/lib/ai/translate-aplus";
import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { deleteStreamVideo, getStreamVideo, streamConfig } from "@/lib/media/cloudflare-stream";
import { getSupplierStorefront } from "@/lib/public/catalog";
import {
  normalizeStorefrontTheme, STOREFRONT_MAX_FEATURED, STOREFRONT_TAGLINE_MAX, storefrontThemeProblem, type StorefrontHeroVideo,
} from "@/lib/storefront-theme";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { revalidatePublicCatalog } from "@/lib/public/revalidate-public";

type Result = { ok: boolean; message: string; tagline?: string };

/**
 * Nhà cung cấp gói Premium/Pro lưu giao diện đầu trang (mẫu Hiện đại): tông màu, câu giới thiệu,
 * số liệu nổi bật, sản phẩm ghim. Câu giới thiệu viết tiếng Việt, máy chủ dịch sang tiếng Anh khi
 * câu đó đổi (giống A+). Sản phẩm ghim phải là sản phẩm đang hiện cho người mua trên trang.
 */
export async function saveStorefrontThemeAction(input: { tone: unknown; tagline: unknown; stats: unknown; featured?: unknown }): Promise<Result> {
  const { m } = await getPortalMessages();
  const copy = m.showcase.theme;
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return { ok: false, message: m.showcase.errors.signIn };
  if (!supplierPlanRules(access.supplier).premiumStorefront) return { ok: false, message: copy.errors.plan };
  const problem = storefrontThemeProblem({ ...input, language: "any" });
  if (problem === "template" || problem === "tone" || problem === "stats") return { ok: false, message: copy.errors.invalid };
  if (problem === "taglineTooLong") return { ok: false, message: fill(copy.errors.taglineTooLong, { max: STOREFRONT_TAGLINE_MAX }) };
  if (problem) return { ok: false, message: copy.errors[problem] };
  const before = normalizeStorefrontTheme(access.supplier.storefront_theme);
  const taglineVi = typeof input.tagline === "string" ? input.tagline.trim() : "";

  // Dịch khi câu tiếng Việt đổi (hoặc chưa có bản tiếng Anh). Câu cũ chỉ có bản tiếng Anh thì giữ.
  let tagline = before.tagline;
  if (!taglineVi) tagline = "";
  else if (taglineVi !== (before.tagline_vi ?? before.tagline) || !before.tagline) {
    if (!aplusTranslationConfigured()) return { ok: false, message: copy.errors.translation };
    try { [tagline] = await translateAplusStrings([taglineVi]); } catch { return { ok: false, message: copy.errors.translation }; }
    const english = storefrontThemeProblem({ tone: input.tone, stats: input.stats, tagline });
    if (english === "language" || english === "contact") return { ok: false, message: copy.errors[english] };
    tagline = tagline.slice(0, STOREFRONT_TAGLINE_MAX);
  }

  // Sản phẩm ghim: chỉ sản phẩm đang hiện cho người mua, giữ thứ tự chọn, tối đa 4.
  const wanted = Array.isArray(input.featured) ? input.featured.filter((id): id is string => typeof id === "string") : [];
  let featured: string[] = [];
  if (wanted.length) {
    const visible = new Set((await getSupplierStorefront(access.supplier)).main_products.map((p) => p.id));
    featured = [...new Set(wanted.filter((id) => visible.has(id)))].slice(0, STOREFRONT_MAX_FEATURED);
  }

  const theme = { ...before, template: "modern", tone: input.tone, tagline, ...(taglineVi ? { tagline_vi: taglineVi } : { tagline_vi: undefined }), stats: input.stats, featured };
  try {
    await access.store.updateSupplier(access.supplier.id, { storefront_theme: theme });
  } catch (error) {
    console.error("[storefront-theme] save failed", error);
    return { ok: false, message: copy.errors.failed };
  }
  await access.store.addAuditLog({
    actor_id: access.user.id, actor_email: access.user.email, entity: "supplier", entity_id: access.supplier.id,
    action: "supplier.storefront_theme_changed", before: access.supplier.storefront_theme ?? null, after: theme,
  }).catch((error) => console.error("[storefront-theme] audit", error));
  revalidatePath("/supplier/portal/storefront");
  revalidatePublicCatalog();
  revalidatePath(`/suppliers/${access.supplier.slug || access.supplier.id}`);
  return { ok: true, message: copy.saved, tagline };
}

/**
 * Video nhà máy ở đầu trang: lưu ngay sau khi tải lên, hoặc xoá khi `videoUid` là null. Video mới
 * phải là video Vexim xin tải lên cho trang của đúng nhà cung cấp này (meta purpose "company");
 * video cũ bị thay thì xoá trên Cloudflare. Thời lượng, ngày tải lên lấy từ Cloudflare.
 */
export async function saveHeroVideoAction(videoUid: string | null): Promise<Result> {
  const { m } = await getPortalMessages();
  const copy = m.showcase.theme;
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return { ok: false, message: m.showcase.errors.signIn };
  const before = normalizeStorefrontTheme(access.supplier.storefront_theme);
  let next: StorefrontHeroVideo | undefined;
  if (videoUid !== null) {
    if (!supplierPlanRules(access.supplier).premiumStorefront) return { ok: false, message: copy.errors.plan };
    if (typeof videoUid !== "string" || !/^[a-f0-9]{32}$/i.test(videoUid)) return { ok: false, message: copy.video.invalid };
    const uid = videoUid.toLowerCase();
    if (uid === before.hero_video?.video_uid) return { ok: true, message: copy.video.saved };
    if (!streamConfig()) return { ok: false, message: m.aplus.errors.videoUnavailable };
    const video = await getStreamVideo(uid).catch(() => null);
    if (!video || video.meta.purpose !== "company" || video.meta.supplier_id !== access.supplier.id ||
        (video.creator && video.creator !== access.supplier.id) || video.state === "error") return { ok: false, message: copy.video.invalid };
    next = { video_uid: uid, ...(video.duration ? { duration: Math.round(video.duration) } : {}), ...(video.uploaded ? { uploaded_at: video.uploaded } : {}) };
  }
  const { hero_video: _old, ...rest } = before;
  void _old;
  try {
    await access.store.updateSupplier(access.supplier.id, { storefront_theme: next ? { ...rest, hero_video: next } : rest });
  } catch (error) {
    console.error("[storefront-theme] hero video", error);
    return { ok: false, message: copy.errors.failed };
  }
  if (before.hero_video && before.hero_video.video_uid !== next?.video_uid) after(() => deleteStreamVideo(before.hero_video!.video_uid));
  await access.store.addAuditLog({
    actor_id: access.user.id, actor_email: access.user.email, entity: "supplier", entity_id: access.supplier.id,
    action: next ? "supplier.hero_video_saved" : "supplier.hero_video_removed", before: { video: before.hero_video?.video_uid ?? null }, after: { video: next?.video_uid ?? null },
  }).catch((error) => console.error("[storefront-theme] audit", error));
  revalidatePath("/supplier/portal/storefront");
  revalidatePublicCatalog();
  revalidatePath(`/suppliers/${access.supplier.slug || access.supplier.id}`);
  return { ok: true, message: next ? copy.video.saved : copy.video.removed };
}
