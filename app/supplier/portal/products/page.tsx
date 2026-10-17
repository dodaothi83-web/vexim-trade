import { redirect } from "next/navigation";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierVisibleProductMedia } from "@/lib/supplier-portal/product-view";
import { SupplierWorkspaceHeader } from "./workspace-header";
import { SupplierProductStorefront } from "./product-storefront";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sản phẩm của tôi | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierProductsPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const products = await access.store.listProductsBySupplier(access.supplier.id);
  // One scoped batch query, not one request per card; never send another supplier's internal files to the browser.
  const allMedia = await access.store.listMediaForProducts(products.map((p) => p.id));
  const media = supplierVisibleProductMedia(allMedia, access.supplier.id, access.user.id);
  return <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
    <SupplierWorkspaceHeader name={access.supplier.display_name || access.supplier.trade_name || access.supplier.name} />
    <SupplierProductStorefront products={products} media={media} supplierPublished={access.supplier.status === "published"} />
  </main>;
}
