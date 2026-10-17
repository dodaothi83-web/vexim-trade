import Link from "next/link";
import { ArrowLeft, FileCheck2, LayoutDashboard, Package2, Plus, ChartNoAxesColumn, Layers3 } from "lucide-react";

/** Private seller workspace; no CRM links and no public/verified claim. */
export function SupplierWorkspaceHeader({ name, active = "products" }: { name: string; active?: "products" | "new" | "edit" | "certificates" | "traffic" | "categories" }) {
  return <header className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-white"><Package2 className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Gian hàng của bạn · riêng tư</p>
          <p className="truncate text-sm font-bold text-slate-900 sm:text-base">{name}</p></div>
      </div>
      <Link href="/supplier/portal" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-teal-700"><ArrowLeft className="size-4" aria-hidden="true" /> Bảng điều khiển</Link>
    </div>
    <nav aria-label="Điều hướng gian hàng" className="flex gap-1 overflow-x-auto px-4 pt-2 sm:px-6">
      <Link href="/supplier/portal" className="inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"><LayoutDashboard className="size-4" aria-hidden="true" /> Tổng quan</Link>
      <Link href="/supplier/portal/products" aria-current={active === "products" || active === "edit" ? "page" : undefined}
        className={`inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${active === "products" || active === "edit" ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"}`}><Package2 className="size-4" aria-hidden="true" /> Sản phẩm</Link>
      <Link href="/supplier/portal/categories" aria-current={active === "categories" ? "page" : undefined}
        className={`inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${active === "categories" ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"}`}><Layers3 className="size-4" aria-hidden="true" /> Danh mục</Link>
      <Link href="/supplier/portal/certificates" aria-current={active === "certificates" ? "page" : undefined}
        className={`inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${active === "certificates" ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"}`}><FileCheck2 className="size-4" aria-hidden="true" /> Chứng nhận</Link>
      <Link href="/supplier/portal/traffic" aria-current={active === "traffic" ? "page" : undefined}
        className={`inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${active === "traffic" ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"}`}><ChartNoAxesColumn className="size-4" aria-hidden="true" /> Lượt xem</Link>
      <Link href="/supplier/portal/products/new" aria-current={active === "new" ? "page" : undefined}
        className={`inline-flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${active === "new" ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"}`}><Plus className="size-4" aria-hidden="true" /> Thêm sản phẩm</Link>
    </nav>
  </header>;
}
