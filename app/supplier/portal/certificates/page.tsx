import Link from "next/link";
import { redirect } from "next/navigation";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { SupplierWorkspaceHeader } from "../products/workspace-header";
import { CertificateSubmission } from "./certificate-submission";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chứng nhận gửi Vexim | Vexim Trade", robots: { index: false, follow: false } };

export default async function OwnCertificatesPage() {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const [certificates, products, media] = await Promise.all([
    access.store.listCertificates(access.supplier.id), access.store.listProductsBySupplier(access.supplier.id),
    access.store.listMedia("supplier", access.supplier.id),
  ]);
  const byId = new Map(media.map((m) => [m.id, m]));
  return <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
    <SupplierWorkspaceHeader name={access.supplier.display_name || access.supplier.trade_name || access.supplier.name} active="certificates" />
    <Link href="/supplier/portal/products" className="mt-6 inline-block text-sm font-semibold text-teal-800 hover:underline">← Sản phẩm của tôi</Link>
    <h1 className="mt-4 text-3xl font-black text-slate-900">Chứng nhận đã gửi</h1>
    <p className="mt-2 text-sm text-slate-600">Kho riêng để Vexim kiểm tra, không phải ảnh gallery sản phẩm hoặc dấu xác minh NCC. Hồ sơ đã duyệt vẫn cần quyết định công bố riêng.</p>
    <div className="mt-6 space-y-3">{certificates.length ? certificates.map((c) => {
      const file = c.file_media_id ? byId.get(c.file_media_id) : null;
      const ownFile = file?.owner_type === "supplier" && file.supplier_id === access.supplier.id && file.created_by === access.user.id && file.kind === "certificate";
      return <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong className="text-slate-900">{c.name}</strong><span className="text-slate-600">{c.review_status === "pending" ? "Đang chờ Vexim kiểm" : c.review_status === "approved" ? c.publicly_visible ? "Vexim đã duyệt & cho phép công bố (nếu còn hạn)" : "Đã kiểm, chưa công bố" : c.review_status === "rejected" ? "Không chấp thuận" : c.review_status === "changes_requested" ? "Cần bổ sung" : "Chưa được xét theo luồng mới"}</span></div>
        <p className="mt-2 text-slate-600">Đứng tên: {c.holder_name || "Chưa khai"} · Có hiệu lực tới: {c.valid_until || "Chưa khai"}</p>
        {ownFile && file.storage_path && <a href={`/api/media/file/${file.storage_path}`} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-teal-800 underline">Xem tệp của tôi (riêng tư) ↗</a>}
        {c.review_note && <p className="mt-2 whitespace-pre-wrap text-amber-900">Phản hồi Vexim: {c.review_note}</p>}
      </div>;
    }) : <p className="rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-600">Chưa gửi chứng nhận nào theo luồng này. Chứng từ đã tải lên Kiểm tra giấy tờ trước đây không tự công bố hoặc tự chuyển vào đây.</p>}</div>
    <CertificateSubmission products={products.map((p) => ({ id: p.id, name: p.name }))} />
  </main>;
}
