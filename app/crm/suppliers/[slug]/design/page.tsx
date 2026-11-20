import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Breadcrumbs } from "@/components/ui";
import { StorefrontDesigner } from "@/components/storefront-designer/storefront-designer";
import { StorefrontVersionHistory } from "@/components/storefront-designer/version-history";
import { hasPermission } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { designerMessages } from "@/lib/i18n/portal/designer";
import { getSupplierStorefront } from "@/lib/public/catalog";
import { publicSupplierCertificates } from "@/lib/public/certificates";
import { CertificatesSection, ChecksSection, CompanyDetailsSection, CompanySection, GallerySection, TradeSection } from "@/components/public/storefront-sections";
import { readStorefrontLayout } from "@/lib/storefront-layout";
import { normalizeStorefrontTheme } from "@/lib/storefront-theme";
import { activeDesignConsent, draftLayoutOf, listStorefrontVersions } from "@/lib/supplier-portal/storefront-design";
import { designerDataFromCard } from "@/lib/supplier-portal/storefront-designer-data";
import { SUPPLIER_PLAN_LABELS, supplierPlanRules } from "@/lib/supplier-plans";
import { applyDesignAction, restoreDesignVersionAction, saveDesignDraftAction } from "./actions";
import { DesignConsentCard } from "./consent-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thiết kế hộ trang nhà cung cấp" };

/**
 * Vexim thiết kế hộ trang nhà cung cấp (dịch vụ bán ngoài hệ thống). Ghi nhận đồng ý trước,
 * rồi dùng cùng trình thiết kế với nhà cung cấp; mỗi lần áp dụng lưu phiên bản và báo nhà cung cấp.
 */
export default async function CrmSupplierDesignPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await requireSession();
  if (!hasPermission(session.role, "suppliers.view")) notFound();
  const { slug: id } = await params;
  const supplier = await getStore().getSupplier(id);
  if (!supplier) notFound();
  const canManage = hasPermission(session.role, "suppliers.manage");
  const rules = supplierPlanRules(supplier);
  const [consent, versions] = await Promise.all([activeDesignConsent(id), listStorefrontVersions(id, 20)]);
  const copy = designerMessages.vi;
  const dateFormat = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
  const published = readStorefrontLayout(supplier.storefront_layout, id);
  const header = <>
    <Breadcrumbs items={[{ label: "Nhà cung cấp", href: "/crm/suppliers" }, { label: supplier.name, href: `/crm/suppliers/${id}` }, { label: "Thiết kế hộ" }]} />
    <PageHeader title="Thiết kế trang hộ nhà cung cấp" sub={`${supplier.name} · Gói ${SUPPLIER_PLAN_LABELS[rules.plan]} · dịch vụ bán ngoài hệ thống`} />
  </>;

  if (!rules.premiumStorefront) return <>
    {header}
    <div className="card p-5 text-sm text-ink-700">
      <p className="flex items-center gap-2 font-bold text-ink-900"><Lock className="size-4 text-brand-700" aria-hidden="true" />Nhà cung cấp chưa có gói Premium/Pro còn hiệu lực</p>
      <p className="mt-1">Dịch vụ thiết kế hộ dùng tính năng trang cao cấp. Bật gói trong <Link href={`/crm/suppliers/${id}`} className="font-semibold text-brand-700 underline">hồ sơ nhà cung cấp</Link> trước.</p>
    </div>
  </>;

  const card = await getSupplierStorefront(supplier);
  const avatarUrl = supplier.profile_image ? `/public-media/${supplier.profile_image.replace(/^\/+/, "")}` : null;
  const coverUrl = supplier.cover_image ? `/public-media/${supplier.cover_image.replace(/^\/+/, "")}` : null;
  const [designCategories, rawCertificates, supplierMedia] = await Promise.all([
    getStore().listCategories({ publishedOnly: true }).catch(() => []),
    getStore().listCertificates(supplier.id).catch(() => []),
    getStore().listMedia("supplier", supplier.id).catch(() => []),
  ]);
  // Nội dung các mục chung dựng từ cùng component với trang thật (nút trong bản xem trước không bấm được).
  const designCertificates = publicSupplierCertificates(supplier.id, rawCertificates, supplierMedia);
  const designSections = {
    company: <CompanySection s={card} />,
    checks: <ChecksSection s={card} />,
    trade: <TradeSection s={card} rfqActions={false} synthetic={false} premium />,
    companyDetails: <CompanyDetailsSection s={card} rfqActions={false} premium />,
    certificates: designCertificates.length ? <CertificatesSection certificates={designCertificates} /> : undefined,
    gallery: card.gallery_images.length ? <GallerySection s={card} /> : undefined,
  };
  const data = designerDataFromCard(card, { avatarUrl, coverUrl, pro: supplierPlanRules(supplier).plan === "pro",
    categories: designCategories.filter((c) => c.status === "published" && c.is_published),
    certificates: publicSupplierCertificates(supplier.id, rawCertificates, supplierMedia) });
  const theme = normalizeStorefrontTheme(supplier.storefront_theme);
  const initial = draftLayoutOf(supplier) ?? data.quick ?? { tone: theme.tone, tagline: "", blocks: [] };
  const live = !!published && JSON.stringify(published) === JSON.stringify(initial);

  return <>
    {header}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <DesignConsentCard supplierId={id} consent={consent} canManage={canManage} />
      <StorefrontVersionHistory copy={copy.versions} showEmail restore={restoreDesignVersionAction.bind(null, id)}
        versions={versions.map((v, index) => ({ id: v.id, when: dateFormat.format(new Date(v.created_at)), role: v.applied_role,
          email: v.applied_by_email, note: v.note, live: index === 0 && !!published }))} />
    </div>
    <h2 className="mb-2 mt-6 text-sm font-bold text-ink-900">2. Thiết kế</h2>
    {consent && canManage
      ? <StorefrontDesigner sections={designSections} pro={data.pro} categories={data.categories} certificates={data.certificates} initial={initial} quick={data.quick} live={live} header={data.header} statValues={data.statValues}
          markets={data.markets} products={data.products} imagePreviewBase={`/api/crm/storefront-image?supplier=${id}&path=`}
          uploadUrl="/api/crm/storefront-image" uploadFields={{ supplier_id: id }}
          saveDraft={saveDesignDraftAction.bind(null, id)} apply={applyDesignAction.bind(null, id)}
          copy={copy} applyLabel="Áp dụng thay nhà cung cấp"
          previewHref={supplier.status === "published" ? `/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}` : null} />
      : <div className="card flex items-center gap-3 p-5 text-sm text-ink-600"><Lock className="size-5 shrink-0 text-ink-400" aria-hidden="true" />
          {canManage ? "Ghi nhận đồng ý ở bước 1 để mở trình thiết kế." : "Bạn cần quyền quản lý nhà cung cấp để thiết kế hộ."}</div>}
  </>;
}
