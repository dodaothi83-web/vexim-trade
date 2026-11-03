import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { PageHeader } from "@/components/page-header";
import { getPortalMessages } from "@/lib/i18n/server";
import { SupplierProductEditor } from "../product-editor";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { readNewQuantityPolicies } from "@/lib/products/quantity-new-config";
import { certificateInheritanceByCategory } from "@/lib/supplier-portal/certificate-inheritance";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { m } = await getPortalMessages();
  return { title: m.productEditor.newPage.title, robots: { index: false, follow: false } };
}

export default async function NewSupplierProductPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { m } = await getPortalMessages();
  const copy = m.productEditor.newPage;
  const publishedCategories = await access.store.listCategories({ publishedOnly: true });
  const options = categoryProposalOptions(publishedCategories);
  // Giấy đã duyệt cho danh mục: form hiện sẵn "Chứng nhận theo danh mục" để nhà cung cấp biết
  // sản phẩm sẽ tự nhận giấy nào, không phải chọn ngăn.
  const certificateInheritance = await certificateInheritanceByCategory(
    access.store, access.supplier.id, publishedCategories,
  ).catch((error) => {
    console.error("[supplier-product] inherited certificates", error);
    return {};
  });
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const categoryScope = allowedSupplierCategories(access.supplier, options, linked).map((item) => item.slug);
  const quantityPolicies = await (async () => {
    if (!getSupabaseClient()) throw new Error("Database unavailable");
    const strictAccess = await supplierPortalAccess(supabaseStore);
    if (!strictAccess || !portalApproved(strictAccess.supplier) || strictAccess.supplier.id !== access.supplier.id) throw new Error("Supplier verification failed");
    return readNewQuantityPolicies(options);
  })().catch((error) => { console.error("[quantity-pricing] new product settings", error); return null; });
  // Kho ảnh: ảnh nhà cung cấp đã tải lên nhưng chưa gắn sản phẩm nào.
  const bankMedia = (await access.store.listMedia("supplier", access.supplier.id).catch((error) => {
    console.error("[supplier-product] media bank", error);
    return [];
  })).filter((asset) => asset.kind === "image" && !!asset.storage_path);
  return <>
    <PageHeader
      eyebrow={m.products.list.eyebrow}
      title={copy.title}
      sub={copy.sub}
      breadcrumbs={<nav aria-label={copy.breadcrumbAria} className="flex items-center gap-1.5 text-xs text-ink-500"><Link href="/supplier/portal/products" className="hover:text-brand-700">{copy.products}</Link><ChevronRight className="size-3.5" aria-hidden="true" /><span className="font-semibold text-ink-800">{copy.breadcrumb}</span></nav>}
    />
    <SupplierProductEditor categories={options} categoryScope={categoryScope} supplier={access.supplier} quantityPolicies={quantityPolicies} bankMedia={bankMedia} certificateInheritance={certificateInheritance} />
  </>;
}
