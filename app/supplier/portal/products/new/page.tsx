import Link from "next/link";
import { redirect } from "next/navigation";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { SupplierProductEditor } from "../product-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thêm sản phẩm | Vexim Trade", robots: { index: false, follow: false } };

export default async function NewSupplierProductPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  return <main className="mx-auto max-w-4xl px-5 py-10">
    <Link href="/supplier/portal/products" className="text-sm font-semibold text-brand-700">← Sản phẩm của tôi</Link>
    <h1 className="mt-5 text-3xl font-black text-ink-900">Thêm sản phẩm</h1>
    <SupplierProductEditor />
  </main>;
}
