import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { SupplierCategoryForm } from "./supplier-category-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Danh mục kinh doanh | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierCategoriesPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const options = categoryProposalOptions(await access.store.listCategories({ publishedOnly: true }));
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const allowed = allowedSupplierCategories(access.supplier, options, linked).map((c) => c.slug);
  return <>
    <PageHeader
      eyebrow="Gian hàng · riêng tư"
      title="Danh mục kinh doanh"
      sub="Chọn từ danh mục Vexim đã mở. Sau đó sản phẩm của bạn chỉ được chọn trong phạm vi này. Thêm danh mục không tự công khai gian hàng hoặc duyệt sản phẩm."
    />
    {options.length ? <SupplierCategoryForm options={options} initial={allowed} /> :
      <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Vexim chưa mở danh mục để chọn. Vui lòng liên hệ Vexim; bạn không thể tự tạo danh mục mới.</div>}
    <Link href="/supplier/portal/products" className="mt-5 inline-block text-sm font-semibold text-brand-800 hover:underline">Trở lại sản phẩm</Link>
  </>;
}
