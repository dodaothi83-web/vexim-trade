import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";

import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import {
  allowedSupplierCategories,
  categoryProposalOptions,
  productCategorySlug,
} from "@/lib/supplier-portal/category-proposals";
import { productReview } from "@/lib/supplier-portal/product-view";

import { SupplierCategoryWorkspace } from "./supplier-category-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Danh mục kinh doanh | Vexim Trade", robots: { index: false, follow: false } };

/**
 * Phạm vi bán hàng của NCC. Trang chỉ ĐỌC dữ liệu rồi chuyển cho một client component
 * duy nhất; mọi quy tắc (CMS-only, 1–5 danh mục, không bỏ danh mục còn sản phẩm) vẫn
 * nằm ở `saveSupplierCategoriesAction`.
 */
export default async function SupplierCategoriesPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");

  const options = categoryProposalOptions(await access.store.listCategories({ publishedOnly: true }));
  // Hồ sơ cũ chưa có `requested_category_slugs` chỉ được dùng liên kết staff từng chốt.
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const allowed = allowedSupplierCategories(access.supplier, options, linked).map((c) => c.slug);
  const products = options.length ? await access.store.listProductsBySupplier(access.supplier.id) : [];

  return <>
    <PageHeader
      eyebrow="Cổng nhà cung cấp · riêng tư"
      title="Danh mục kinh doanh"
      sub="Chọn từ danh mục Vexim đã mở. Sau đó sản phẩm của bạn chỉ được chọn trong phạm vi này. Thêm danh mục không tự công khai gian hàng hoặc duyệt sản phẩm."
      actions={<Link href="/supplier/portal/products" className="btn btn-ghost btn-sm">Sản phẩm của tôi</Link>}
    />

    {options.length
      ? <SupplierCategoryWorkspace
        options={options}
        initial={allowed}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          categorySlug: productCategorySlug(product),
          review: productReview(product),
        }))}
      />
      : <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <h2 className="text-base font-bold">Vexim chưa mở danh mục để chọn</h2>
        <p className="mt-2">Bạn không thể tự tạo danh mục mới. Vui lòng liên hệ Vexim; khi Vexim mở danh mục, danh sách sẽ hiện tại đây để bạn chọn phạm vi bán hàng.</p>
        <p className="mt-2">Sản phẩm, RFQ và thông báo ở các mục khác vẫn dùng bình thường.</p>
        <Link href="/supplier/portal" className="mt-3 inline-block font-semibold text-amber-900 underline">Về bảng điều khiển</Link>
      </div>}
  </>;
}
