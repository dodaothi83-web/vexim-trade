import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { PageHeader } from "@/components/page-header";
import { SupplierProductEditor } from "../product-editor";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thêm sản phẩm", robots: { index: false, follow: false } };

export default async function NewSupplierProductPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const options = categoryProposalOptions(await access.store.listCategories({ publishedOnly: true }));
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const categoryScope = allowedSupplierCategories(access.supplier, options, linked).map((item) => item.slug);
  return <>
    <PageHeader
      eyebrow="Cổng nhà cung cấp · riêng tư"
      title="Thêm sản phẩm"
      sub="Bắt đầu từ tên và quy cách. Bạn có thể lưu bản nháp trước, bổ sung ảnh sau."
      breadcrumbs={<nav aria-label="Đường dẫn" className="flex items-center gap-1.5 text-xs text-ink-500"><Link href="/supplier/portal/products" className="hover:text-brand-700">Sản phẩm</Link><ChevronRight className="size-3.5" aria-hidden="true" /><span className="font-semibold text-ink-800">Thêm mới</span></nav>}
    />
    <SupplierProductEditor categories={options} categoryScope={categoryScope} supplier={access.supplier} />
  </>;
}
