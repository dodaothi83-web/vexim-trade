import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { SupplierProductEditor } from "../product-editor";
import { SupplierWorkspaceHeader } from "../workspace-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Thêm sản phẩm | Vexim Trade", robots: { index: false, follow: false } };

export default async function NewSupplierProductPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  return <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
    <SupplierWorkspaceHeader name={access.supplier.display_name || access.supplier.trade_name || access.supplier.name} active="new" />
    <nav aria-label="Đường dẫn" className="mt-6 flex items-center gap-1.5 text-xs text-slate-500"><Link href="/supplier/portal/products" className="hover:text-teal-700">Sản phẩm</Link><ChevronRight className="size-3.5" aria-hidden="true" /><span className="font-semibold text-slate-800">Thêm mới</span></nav>
    <div className="mt-4"><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Hồ sơ sản phẩm mới</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Thêm sản phẩm</h1>
      <p className="mt-2 text-sm text-slate-600">Bắt đầu từ tên và quy cách. Bạn có thể lưu bản nháp trước, bổ sung ảnh sau.</p></div>
    <SupplierProductEditor />
  </main>;
}
