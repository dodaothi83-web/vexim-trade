import { redirect } from "next/navigation";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierVisibleProductMedia } from "@/lib/supplier-portal/product-view";
import { allowedSupplierCategories, categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { SupplierProductStorefront } from "./product-storefront";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sản phẩm của tôi | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierProductsPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const [products, allCategories] = await Promise.all([
    access.store.listProductsBySupplier(access.supplier.id),
    access.store.listCategories({ publishedOnly: true }),
  ]);
  // One scoped batch query, not one request per card; never send another supplier's internal files to the browser.
  const allMedia = await access.store.listMediaForProducts(products.map((p) => p.id));
  const media = supplierVisibleProductMedia(allMedia, access.supplier.id, access.user.id);
  // Nhãn danh mục + phạm vi đã chọn: trang sản phẩm nói cùng ngôn ngữ với trang Danh mục
  // kinh doanh thay vì hiện slug thô (cashew-kernels…).
  const options = categoryProposalOptions(allCategories);
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const scope = allowedSupplierCategories(access.supplier, options, linked).map((c) => c.slug);
  const categoryLabels = Object.fromEntries(options.map((c) => [c.slug, c.label]));
  return <SupplierProductStorefront
    products={products}
    media={media}
    supplierPublished={access.supplier.status === "published"}
    categoryLabels={categoryLabels}
    scope={scope}
  />;
}
