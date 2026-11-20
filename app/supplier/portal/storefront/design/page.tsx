import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StorefrontDesigner } from "@/components/storefront-designer/storefront-designer";
import { StorefrontVersionHistory } from "@/components/storefront-designer/version-history";
import { getPortalMessages } from "@/lib/i18n/server";
import { getSupplierStorefront } from "@/lib/public/catalog";
import { publicSupplierCertificates } from "@/lib/public/certificates";
import { CertificatesSection, ChecksSection, CompanyDetailsSection, CompanySection, GallerySection, TradeSection } from "@/components/public/storefront-sections";
import { readStorefrontLayout } from "@/lib/storefront-layout";
import { normalizeStorefrontTheme } from "@/lib/storefront-theme";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { draftLayoutOf, listStorefrontVersions } from "@/lib/supplier-portal/storefront-design";
import { designerDataFromCard } from "@/lib/supplier-portal/storefront-designer-data";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { withoutDirectContacts } from "@/lib/public/product-selection";
import { supplierSummaryRich } from "@/lib/public/supplier-english";
import { applyStorefrontLayoutAction, restoreStorefrontVersionAction, saveStorefrontDraftAction } from "../design-actions";
import { saveStorefrontProfileFieldsAction } from "../profile-fields-action";

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
  const coverUrl = supplier.cover_image ? `/public-media/${supplier.cover_image.replace(/^\/+/, "")}` : null;
  const [designCategories, rawCertificates, supplierMedia] = await Promise.all([
    access.store.listCategories({ publishedOnly: true }).catch(() => []),
    access.store.listCertificates(supplier.id).catch(() => []),
    access.store.listMedia("supplier", supplier.id).catch(() => []),
  ]);
  // Nội dung các mục chung dựng từ cùng component với trang thật (nút trong bản xem trước không bấm được).
  const designCertificates = publicSupplierCertificates(supplier.id, rawCertificates, supplierMedia);
  const designSections = {
    company: <CompanySection s={card} premium />,
    companyBusiness: <CompanySection s={card} premium hideIntro />,
    checks: <ChecksSection s={card} />,
    trade: <TradeSection s={card} rfqActions={false} synthetic={false} premium />,
    companyDetails: <CompanyDetailsSection s={card} rfqActions={false} premium />,
    certificates: designCertificates.length ? <CertificatesSection certificates={designCertificates} /> : undefined,
    gallery: card.gallery_images.length ? <GallerySection s={card} /> : undefined,
  };
  const data = designerDataFromCard(card, { avatarUrl, coverUrl, pro: supplierPlanRules(supplier).plan === "pro",
    categories: designCategories.filter((c) => c.status === "published" && c.is_published),
    certificates: publicSupplierCertificates(supplier.id, rawCertificates, supplierMedia) });
  const published = readStorefrontLayout(supplier.storefront_layout, supplier.id);
  const theme = normalizeStorefrontTheme(supplier.storefront_theme);
  const initial = draftLayoutOf(supplier) ?? data.quick ?? { tone: theme.tone, tagline: "", blocks: [] };
  const live = !!published && JSON.stringify(published) === JSON.stringify(initial);
  const dateFormat = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

  return <>
    {back}
    <PageHeader title={copy.title} sub={copy.sub} />
    <StorefrontDesigner profile={{ save: saveStorefrontProfileFieldsAction, values: {
        intro_source: supplier.intro_source ?? "", intro_en: withoutDirectContacts(supplierSummaryRich(card)), products: supplier.products ?? "", markets: supplier.markets ?? "",
        trade_name: supplier.trade_name ?? "", annual_output: supplier.annual_output ?? "", payment_terms: supplier.payment_terms ?? "",
        founded_year: supplier.founded_year ? String(supplier.founded_year) : "", employees: supplier.employees ? String(supplier.employees) : "",
        lead_time_days: supplier.lead_time_days ? String(supplier.lead_time_days) : "",
        ports: (supplier.ports ?? []).join(", "), incoterms: (supplier.incoterms ?? []).join(", "), export_markets: (supplier.export_markets ?? []).join(", "),
        legal_name: supplier.name, address: supplier.address ?? "", moq: supplier.moq_text ?? "",
      } }} sections={designSections} pro={data.pro} categories={data.categories} certificates={data.certificates} initial={initial} quick={data.quick} live={live} header={data.header} statValues={data.statValues}
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
