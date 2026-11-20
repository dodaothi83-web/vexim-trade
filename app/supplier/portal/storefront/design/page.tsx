import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StorefrontDesigner } from "@/components/storefront-designer/storefront-designer";
import { StorefrontVersionHistory } from "@/components/storefront-designer/version-history";
import { getPortalMessages } from "@/lib/i18n/server";
import { getSupplierStorefront } from "@/lib/public/catalog";
import { readStorefrontLayout } from "@/lib/storefront-layout";
import { normalizeStorefrontTheme } from "@/lib/storefront-theme";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { draftLayoutOf, listStorefrontVersions } from "@/lib/supplier-portal/storefront-design";
import { designerDataFromCard } from "@/lib/supplier-portal/storefront-designer-data";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { applyStorefrontLayoutAction, restoreStorefrontVersionAction, saveStorefrontDraftAction } from "../design-actions";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.designer.metaTitle, robots: { index: false, follow: false } };
}

/** "Thiết kế trang" của nhà cung cấp gói Premium/Pro. */
export default async function StorefrontDesignPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier } = access;
  const { m, locale } = await getPortalMessages();
  const copy = m.designer;
  const back = <Link href="/supplier/portal/storefront" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" aria-hidden="true" />{copy.back}</Link>;

  if (!supplierPlanRules(supplier).premiumStorefront) return <>
    {back}
    <PageHeader title={copy.title} sub={copy.sub} />
    <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-5 text-sm text-ink-700">
      <p className="flex items-center gap-2 font-bold text-ink-900"><Lock className="size-4 text-brand-700" aria-hidden="true" />{copy.plan}</p>
    </div>
  </>;

  const avatarUrl = supplier.profile_image ? `/public-media/${supplier.profile_image.replace(/^\/+/, "")}` : null;
  const [card, versions] = await Promise.all([getSupplierStorefront(supplier), listStorefrontVersions(supplier.id)]);
  const data = designerDataFromCard(card, { avatarUrl });
  const published = readStorefrontLayout(supplier.storefront_layout, supplier.id);
  const theme = normalizeStorefrontTheme(supplier.storefront_theme);
  const initial = draftLayoutOf(supplier) ?? data.quick ?? { template: theme.template, tone: theme.tone, tagline: "", blocks: [] };
  const live = !!published && JSON.stringify(published) === JSON.stringify(initial);
  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

  return <>
    {back}
    <PageHeader title={copy.title} sub={copy.sub} />
    <StorefrontDesigner initial={initial} quick={data.quick} live={live} header={data.header} statValues={data.statValues}
      markets={data.markets} products={data.products} imagePreviewBase="/api/supplier-portal/showcase?path="
      uploadUrl="/api/supplier-portal/storefront-image" saveDraft={saveStorefrontDraftAction} apply={applyStorefrontLayoutAction}
      copy={copy} previewHref="/supplier/portal/storefront?draft=1" />
    <div className="mt-4 max-w-xl">
      <StorefrontVersionHistory copy={copy.versions} restore={restoreStorefrontVersionAction}
        versions={versions.map((v, index) => ({ id: v.id, when: dateFormat.format(new Date(v.created_at)), role: v.applied_role,
          email: null, note: v.applied_role === "staff" ? v.note : null, live: index === 0 && !!published }))} />
    </div>
  </>;
}
