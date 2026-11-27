import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { GuideHint } from "@/components/guides/guide-hint";
import { getPortalMessages } from "@/lib/i18n/server";
import { canEditAplus, readAplusModules } from "@/lib/products/aplus";
import { publicProductCategorySlug } from "@/lib/public/product-selection";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { ProductAplusWorkspace } from "./workspace";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.aplus.title, robots: { index: false, follow: false } };
}

/** Sản phẩm → "Nội dung A+": trang soạn A+ riêng (gói Premium/Pro). */
export default async function ProductAplusPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) notFound();
  const { m } = await getPortalMessages();
  const allowed = supplierPlanRules(access.supplier, new Date(), await readPlanCatalog()).richContent;
  const categories = product.supplier_review_status === "approved"
    ? await access.store.listCategories({ publishedOnly: true }).catch(() => []) : [];
  const slug = categories.length ? publicProductCategorySlug(product, categories) : null;
  return <>
    <PageHeader help={<GuideHint topic="san-pham" />} title={m.aplus.title} sub={product.display_name || product.name} />
    <ProductAplusWorkspace productId={product.id} allowed={allowed} editable={canEditAplus(product)} copy={m.aplus}
      initial={readAplusModules(product.aplus_content, { supplierId: product.supplier_id, productId: product.id })}
      mode={product.content_mode ?? null}
      publicHref={slug ? `/products/${encodeURIComponent(slug)}/${encodeURIComponent(product.id)}` : null} />
  </>;
}
