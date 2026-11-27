import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { GuideHint } from "@/components/guides/guide-hint";
import { getPortalMessages } from "@/lib/i18n/server";
import { COMPANY_APLUS_ID, readAplusModules } from "@/lib/products/aplus";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { normalizeShowcaseBlocks } from "@/lib/supplier-showcase";
import { CompanyAplusWorkspace } from "./workspace";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.aplus.company.title, robots: { index: false, follow: false } };
}

/** "Trang của tôi" → Nội dung A+ doanh nghiệp (gói Premium/Pro). */
export default async function CompanyAplusPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { supplier } = access;
  const { m } = await getPortalMessages();
  const copy = m.aplus;
  const allowed = supplierPlanRules(supplier, new Date(), await readPlanCatalog()).premiumStorefront;
  const published = supplier.status === "published";
  return <>
    <PageHeader help={<GuideHint topic="ho-so-xac-minh" />} title={copy.company.title} sub={copy.company.cardBody} />
    <CompanyAplusWorkspace allowed={allowed} copy={copy}
      initial={readAplusModules(supplier.company_aplus, { supplierId: supplier.id, productId: COMPANY_APLUS_ID })}
      showcaseCount={normalizeShowcaseBlocks(supplier.showcase_blocks).length}
      publicHref={published ? `/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}` : null} />
  </>;
}
