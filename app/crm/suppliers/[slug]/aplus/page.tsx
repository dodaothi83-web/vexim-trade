import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { requirePagePermission } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { COMPANY_APLUS_ID, readAplusModules } from "@/lib/products/aplus";
import { readPlanCatalog } from "@/lib/supplier-plan-catalog";
import { supplierPlanRules } from "@/lib/supplier-plans";
import { CrmAplusWorkspace } from "../../../aplus-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soạn A+ doanh nghiệp", robots: { index: false, follow: false } };

/** CRM: soạn A+ doanh nghiệp hộ nhà cung cấp (lưu là đăng ngay, dưới mục About). */
export default async function CrmCompanyAplusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: id } = await params;
  await requirePagePermission("suppliers.manage", "/crm/suppliers");
  const supplier = await getStore().getSupplier(id);
  if (!supplier) notFound();
  const visible = supplierPlanRules(supplier, new Date(), await readPlanCatalog()).premiumStorefront;
  return <>
    <PageHeader eyebrow={supplier.name} title="Soạn A+ doanh nghiệp" sub="Hiện dưới mục About trên trang nhà cung cấp." />
    <CrmAplusWorkspace kind="company" id={supplier.id} backHref={`/crm/suppliers/${supplier.id}`} backLabel="Về nhà cung cấp"
      initial={readAplusModules(supplier.company_aplus, { supplierId: supplier.id, productId: COMPANY_APLUS_ID })}
      publicHref={supplier.status === "published" ? `/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}` : null}
      visible={visible} planNote="Nhà cung cấp chưa có gói Premium hoặc Pro: A+ doanh nghiệp lưu được nhưng chưa hiện cho người mua cho tới khi nâng gói." />
  </>;
}
