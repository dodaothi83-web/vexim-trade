import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { SupplierProductEditor } from "../product-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý sản phẩm | Vexim Trade", robots: { index: false, follow: false } };

export default async function OwnProductPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) notFound();
  const media = (await access.store.listMedia("product", id)).filter((m) => m.created_by === access.user.id || m.audience === "buyer");
  return <main className="mx-auto max-w-4xl px-5 py-10">
    <Link href="/supplier/portal/products" className="text-sm font-semibold text-brand-700">← Sản phẩm của tôi</Link>
    <h1 className="mt-5 text-3xl font-black text-ink-900">{product.name}</h1>
    <SupplierProductEditor product={product} media={media} userId={access.user.id} />
  </main>;
}
