import Link from "next/link";
import { redirect } from "next/navigation";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { SupplierCategoryForm } from "./supplier-category-form";
import { SupplierWorkspaceHeader } from "../products/workspace-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Danh mục kinh doanh | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierCategoriesPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const options = categoryProposalOptions(await access.store.listCategories({ publishedOnly: true }));
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const allowed = allowedSupplierCategories(access.supplier, options, linked).map((c) => c.slug);
  return <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
    <SupplierWorkspaceHeader name={access.supplier.display_name || access.supplier.trade_name || access.supplier.name} active="categories" />
    <div className="mt-8 max-w-2xl"><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Gian hàng · riêng tư</p>
      <h1 className="mt-2 text-3xl font-black text-slate-900">Danh mục kinh doanh</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Chọn từ danh mục Vexim đã mở. Sau đó sản phẩm của bạn chỉ được chọn trong phạm vi này. Thêm danh mục không tự công khai gian hàng hoặc duyệt sản phẩm.</p></div>
    {options.length ? <SupplierCategoryForm options={options} initial={allowed} /> :
      <div role="status" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Vexim chưa mở danh mục để chọn. Vui lòng liên hệ Vexim; bạn không thể tự tạo danh mục mới.</div>}
    <Link href="/supplier/portal/products" className="mt-6 inline-block text-sm font-semibold text-teal-800 hover:underline">← Trở lại sản phẩm</Link>
  </main>;
}
