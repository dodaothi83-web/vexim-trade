"use server";

import { revalidatePath } from "next/cache";

import type { DesignerMessages } from "@/lib/i18n/portal/designer";
import { getPortalMessages } from "@/lib/i18n/server";
import { validateStorefrontLayout } from "@/lib/storefront-layout";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { applyStorefrontLayout, getStorefrontVersion, layoutProblemMessage, saveStorefrontDraft, verifyLayoutVideos } from "@/lib/supplier-portal/storefront-design";
import { supplierPlanRules } from "@/lib/supplier-plans";

type Result = { ok: boolean; message: string };

async function context(): Promise<
  | { copy: DesignerMessages; error: string; access?: undefined }
  | { copy: DesignerMessages; error?: undefined; access: NonNullable<Awaited<ReturnType<typeof supplierPortalAccess>>> }> {
  const { m } = await getPortalMessages();
  const copy = m.designer;
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return { copy, error: m.showcase.errors.signIn };
  if (!supplierPlanRules(access.supplier).premiumStorefront) return { copy, error: copy.plan };
  return { copy, access };
}

async function checked(raw: unknown) {
  const ctx = await context();
  if (ctx.error !== undefined) return { ok: false as const, message: ctx.error };
  const products = await ctx.access.store.listProductsBySupplier(ctx.access.supplier.id);
  const result = validateStorefrontLayout(raw, { supplierId: ctx.access.supplier.id,
    productIds: new Set(products.filter((p) => p.supplier_id === ctx.access.supplier.id).map((p) => p.id)),
    pro: supplierPlanRules(ctx.access.supplier).plan === "pro" });
  if (!result.ok) return { ok: false as const, message: layoutProblemMessage(result.problem, ctx.copy.errors) };
  const videos = await verifyLayoutVideos(result.layout, ctx.access.supplier);
  if (!videos.ok) return { ok: false as const, message: videos.index === null ? ctx.copy.errors.videoUnavailable : layoutProblemMessage({ code: "video", index: videos.index }, ctx.copy.errors) };
  return { ok: true as const, ctx: { copy: ctx.copy, access: ctx.access }, layout: videos.layout };
}

function refresh(slug: string) {
  revalidatePath("/supplier/portal/storefront");
  revalidatePath("/supplier/portal/storefront/design");
  revalidatePath(`/suppliers/${slug}`);
}

/** Lưu bản nháp: người mua chưa thấy. */
export async function saveStorefrontDraftAction(raw: unknown): Promise<Result> {
  const result = await checked(raw);
  if (!result.ok) return result;
  const { ctx, layout } = result;
  try {
    await saveStorefrontDraft(ctx.access.store, ctx.access.supplier.id, layout);
  } catch (error) {
    console.error("[storefront-design] save draft", error);
    return { ok: false, message: ctx.copy.failed };
  }
  revalidatePath("/supplier/portal/storefront/design");
  return { ok: true, message: ctx.copy.saved };
}

/** Áp dụng: người mua thấy ngay; bản trước được giữ trong lịch sử phiên bản. */
export async function applyStorefrontLayoutAction(raw: unknown): Promise<Result> {
  const result = await checked(raw);
  if (!result.ok) return result;
  const { ctx, layout } = result;
  const { access } = ctx;
  try {
    await applyStorefrontLayout(access.store, access.supplier, layout, { id: access.user.id, email: access.user.email, role: "supplier" });
  } catch (error) {
    console.error("[storefront-design] apply", error);
    return { ok: false, message: ctx.copy.failed };
  }
  await access.store.addAuditLog({ actor_id: access.user.id, actor_email: access.user.email, entity: "supplier", entity_id: access.supplier.id,
    action: "supplier.storefront_applied", before: null, after: { blocks: layout.blocks.map((b) => b.type), tone: layout.tone } })
    .catch((error) => console.error("[storefront-design] audit", error));
  refresh(access.supplier.slug || access.supplier.id);
  return { ok: true, message: ctx.copy.applied };
}

/** Khôi phục một phiên bản đã áp dụng trước đây. */
export async function restoreStorefrontVersionAction(versionId: string): Promise<Result> {
  const ctx = await context();
  if (ctx.error !== undefined) return { ok: false, message: ctx.error };
  const { access, copy } = ctx;
  const version = await getStorefrontVersion(access.supplier.id, String(versionId ?? ""));
  if (!version?.layout) return { ok: false, message: copy.failed };
  return applyStorefrontLayoutAction(version.layout).then((res) => res.ok ? { ok: true, message: copy.versions.restored } : res);
}
