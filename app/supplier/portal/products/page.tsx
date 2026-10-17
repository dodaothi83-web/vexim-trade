import Link from "next/link";
import { redirect } from "next/navigation";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sản phẩm của tôi | Vexim Trade", robots: { index: false, follow: false } };

const LABELS: Record<string, string> = {
  draft: "Bản nháp", pending: "Chờ Vexim kiểm tra", approved: "Vexim đã xác nhận nội dung", changes_requested: "Cần chỉnh sửa",
};

export default async function SupplierProductsPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const products = await access.store.listProductsBySupplier(access.supplier.id);
  return <main className="mx-auto max-w-5xl px-5 py-10">
    <Link href="/supplier/portal" className="text-sm font-semibold text-brand-700">← Bảng điều khiển</Link>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div>
      <h1 className="text-3xl font-black text-ink-900">Sản phẩm của tôi</h1>
      <p className="mt-2 text-sm text-ink-600">Tạo bản nháp, tải ảnh/catalogue thật và gửi Vexim kiểm tra. Chưa tự công khai hay gửi buyer.</p>
    </div><Link href="/supplier/portal/products/new" className="btn btn-primary">+ Thêm sản phẩm</Link></div>
    {products.length ? <ul className="mt-7 space-y-3">{products.map((p) => <li key={p.id} className="rounded-xl border border-ink-200 bg-white p-4">
      <Link href={`/supplier/portal/products/${p.id}`} className="font-bold text-brand-700 hover:underline">{p.name}</Link>
      <p className="mt-1 text-sm text-ink-600">{p.spec || p.description || "Chưa có quy cách"} · {LABELS[p.supplier_review_status ?? "approved"] ?? "Vexim đang xử lý"}</p>
      {p.supplier_review_note && <p className="mt-1 text-sm text-amber-800">Vexim yêu cầu: {p.supplier_review_note}</p>}
      <p className="mt-1 text-xs text-ink-500">{p.ready_for_buyer && p.supplier_review_status === "approved" ? "Vexim đã bật sẵn sàng gửi buyer (việc xuất hiện còn tùy trang NCC/danh mục)." : "Chưa tự công khai."}</p>
    </li>)}</ul> : <p className="mt-7 rounded-xl border border-dashed border-ink-200 bg-white p-6 text-sm text-ink-600">Chưa có sản phẩm. Bạn có thể bắt đầu bằng một mặt hàng và quy cách thực tế.</p>}
  </main>;
}
