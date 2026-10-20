import Link from "next/link";
import { notFound } from "next/navigation";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { CertificateReviewControls } from "./review-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Xét duyệt chứng nhận NCC | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierCertificatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: id } = await params;
  const session = await requirePagePermission("verifications.view", "/crm/suppliers");
  const store = getStore();
  const supplier = await store.getSupplier(id);
  if (!supplier) notFound();
  const [certificates, products, media] = await Promise.all([
    store.listCertificates(id), store.listProductsBySupplier(id), store.listMedia("supplier", id),
  ]);
  const byId = new Map(media.map((m) => [m.id, m]));
  return <main className="mx-auto max-w-5xl px-5 py-8">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Link className="text-sm font-semibold text-brand-700 hover:underline" href={`/crm/suppliers/${id}`}>← Hồ sơ {supplier.name}</Link>
      <Link className="text-sm font-semibold text-teal-700 hover:underline" href={`/crm/suppliers/${id}/audit/documents`}>Kiểm tra giấy tờ (L1) →</Link>
    </div>
    <h1 className="mt-5 text-3xl font-black text-ink-900">Chứng nhận · {supplier.name}</h1>
    <p className="mt-2 text-sm text-ink-600">Luồng độc lập với Kiểm tra giấy tờ/Thăm nhà máy/Lịch sử giao hàng. Tệp NCC nộp chỉ nội bộ; chấp thuận bản sao và công bố trên sản phẩm là hai quyết định riêng. Không tự nhận đã xác thực với cơ quan cấp.</p>
    <div className="mt-6 space-y-5">{certificates.length ? certificates.map((c) => {
      const file = c.file_media_id ? byId.get(c.file_media_id) : null;
      return <section key={c.id} className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-ink-900">{c.name}</h2><span className="rounded-full bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-700">{c.review_status === "pending" ? "Chờ kiểm" : c.review_status === "approved" ? "Đã kiểm bản sao" : c.review_status === "changes_requested" ? "Cần bổ sung" : c.review_status === "rejected" ? "Không chấp thuận" : "Hồ sơ cũ · chưa kiểm"}</span></div>
        <dl className="mt-3 grid gap-2 text-sm text-ink-700 sm:grid-cols-2">
          <div><dt className="font-semibold">Đơn vị đứng tên</dt><dd>{c.holder_name || "Chưa khai"}</dd></div>
          <div><dt className="font-semibold">Tổ chức cấp / số</dt><dd>{c.issuer || "Chưa khai"} {c.number ? `· ${c.number}` : ""}</dd></div>
          <div><dt className="font-semibold">Phạm vi</dt><dd className="whitespace-pre-wrap">{c.scope_text || "Chưa khai"}</dd></div>
          <div><dt className="font-semibold">Hiệu lực</dt><dd>{c.valid_until || "Chưa khai"}</dd></div>
        </dl>
        <div className="mt-3 text-sm">{file?.storage_path && file.owner_type === "supplier" && file.supplier_id === id && file.kind === "certificate"
          ? <a className="font-semibold text-brand-700 underline" target="_blank" rel="noreferrer" href={`/api/media/file/${file.storage_path}`}>Mở tệp bằng chứng nội bộ ↗</a>
          : <p className="font-semibold text-rose-700">Thiếu tệp chứng nhận hợp lệ; không được duyệt/công bố.</p>}</div>
        <p className="mt-3 text-xs text-ink-600">NCC đề xuất: {c.requested_product_ids?.length ? products.filter((p) => c.requested_product_ids?.includes(p.id)).map((p) => p.name).join(", ") : "Chưa chọn sản phẩm"} · Vexim xác nhận: {c.approved_product_ids?.length ? products.filter((p) => c.approved_product_ids?.includes(p.id)).map((p) => p.name).join(", ") : "Chưa chọn"}</p>
        {c.review_note && <p className="mt-2 text-sm text-amber-900">Ghi chú Vexim: {c.review_note}</p>}
        <CertificateReviewControls id={c.id} status={c.review_status ?? "unreviewed"} visible={!!c.publicly_visible} approvedIds={c.approved_product_ids ?? []}
          products={products.map((p) => ({ id: p.id, name: p.name }))}
          canReview={hasPermission(session.role, "verifications.approve")}
          canPublish={hasPermission(session.role, "suppliers.publish")} />
      </section>;
    }) : <div className="rounded-xl border border-dashed border-ink-200 p-8 text-sm text-ink-600">Chưa có chứng nhận NCC gửi theo luồng xét duyệt riêng. Giấy tờ bước đầu vẫn xem ở trang <Link className="font-semibold text-brand-700 underline" href={`/crm/suppliers/${id}/audit/documents`}>Kiểm tra giấy tờ (L1)</Link>.</div>}</div>
  </main>;
}
