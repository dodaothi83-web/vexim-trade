import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierVisibleProductMedia } from "@/lib/supplier-portal/product-view";
import { SupplierProductEditor } from "../product-editor";
import { SupplierWorkspaceHeader } from "../workspace-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý sản phẩm | Vexim Trade", robots: { index: false, follow: false } };

export default async function OwnProductPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { id } = await params;
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) notFound();
  const media = supplierVisibleProductMedia(await access.store.listMedia("product", id), access.supplier.id, access.user.id);
  return <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
    <SupplierWorkspaceHeader name={access.supplier.display_name || access.supplier.trade_name || access.supplier.name} active="edit" />
    <nav aria-label="Đường dẫn" className="mt-6 flex min-w-0 items-center gap-1.5 text-xs text-slate-500"><Link href="/supplier/portal/products" className="shrink-0 hover:text-teal-700">Sản phẩm</Link><ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate font-semibold text-slate-800">{product.name}</span></nav>
    <div className="mt-4"><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Chỉnh sửa sản phẩm</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{product.name}</h1>
      <p className="mt-2 text-sm text-slate-600">Hoàn thiện thông tin, kiểm tra tệp đã tải và theo dõi phản hồi của Vexim.</p></div>
    <SupplierProductEditor product={product} media={media} userId={access.user.id} />
  </main>;
}
