"use server";

import { revalidatePath } from "next/cache";

import { fill } from "@/lib/i18n/format";
import { getPortalMessages } from "@/lib/i18n/server";
import { STOREFRONT_TAGLINE_MAX, storefrontThemeProblem } from "@/lib/storefront-theme";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierPlanRules } from "@/lib/supplier-plans";

type Result = { ok: boolean; message: string };

/** Nhà cung cấp gói Premium/Pro lưu mẫu, tông màu, câu giới thiệu và số liệu nổi bật. */
export async function saveStorefrontThemeAction(input: { template: unknown; tone: unknown; tagline: unknown; stats: unknown }): Promise<Result> {
  const { m } = await getPortalMessages();
  const copy = m.showcase.theme;
  const access = await supplierPortalAccess();
  if (!access || !portalApproved(access.supplier)) return { ok: false, message: m.showcase.errors.signIn };
  if (!supplierPlanRules(access.supplier).premiumStorefront) return { ok: false, message: copy.errors.plan };
  const problem = storefrontThemeProblem(input);
  if (problem === "template" || problem === "tone" || problem === "stats") return { ok: false, message: copy.errors.invalid };
  if (problem === "taglineTooLong") return { ok: false, message: fill(copy.errors.taglineTooLong, { max: STOREFRONT_TAGLINE_MAX }) };
  if (problem) return { ok: false, message: copy.errors[problem] };
  const theme = {
    template: input.template, tone: input.tone,
    tagline: typeof input.tagline === "string" ? input.tagline.trim() : "",
    stats: input.stats,
  };
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
  revalidatePath(`/suppliers/${access.supplier.slug || access.supplier.id}`);
  return { ok: true, message: copy.saved };
}
