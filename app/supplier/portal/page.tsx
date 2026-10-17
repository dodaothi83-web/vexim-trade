import Link from "next/link";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/auth-actions";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { L1_DOC_ITEMS } from "@/lib/types";
import { SupplierPortalUpload } from "./supplier-portal-upload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hồ sơ doanh nghiệp | Vexim Trade", robots: { index: false, follow: false } };

export default async function SupplierPortal() {
  const session = await requireSession();
  if (session.role !== "supplier") redirect("/crm/dashboard");
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  const { supplier, review, reviews, user, store } = access;
  const [media, requests] = await Promise.all([
    review ? store.listMedia("verification", review.id) : Promise.resolve([]),
    store.listSupplierVerificationRequests(supplier.id),
  ]);
  const mine = media.filter((m) => m.created_by === user.id && m.storage_path &&
    INITIAL_DOCUMENT_KEYS.includes(m.checklist_key as typeof INITIAL_DOCUMENT_KEYS[number]));
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
      <Link href="/" className="text-sm font-semibold text-brand-700">← Vexim Trade</Link>
      <form action={logoutAction}>
        <button className="btn btn-ghost" type="submit">Đăng xuất</button>
      </form>
    </div>
    <h1 className="text-3xl font-black text-ink-900">Hồ sơ doanh nghiệp</h1>
    <p className="mt-2 text-sm text-ink-600">{supplier.name} · {user.email}</p>
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      Hồ sơ đang ở trạng thái <strong>{supplier.status === "draft" ? "chờ Vexim rà soát" : supplier.status}</strong>.
      Thông tin/tệp do doanh nghiệp cung cấp không tự động được xác minh hoặc duyệt; Vexim quyết định riêng việc công khai hồ sơ và sản phẩm.
    </div>
    <section className="mt-7 rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-lg font-bold text-ink-900">Thông tin đã khai</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-ink-600">Tên doanh nghiệp</dt><dd>{supplier.name}</dd></div>
        <div><dt className="font-semibold text-ink-600">Mã số thuế (tự khai)</dt><dd>{review?.tax_number ?? "—"}</dd></div>
        <div><dt className="font-semibold text-ink-600">Người liên hệ</dt><dd>{supplier.contact_name ?? "—"}</dd></div>
        <div><dt className="font-semibold text-ink-600">Số điện thoại</dt><dd>{supplier.phone ?? "—"}</dd></div>
        <div><dt className="font-semibold text-ink-600">Địa chỉ</dt><dd>{supplier.address ?? "—"}</dd></div>
        <div><dt className="font-semibold text-ink-600">Mặt hàng chính</dt><dd>{supplier.products ?? "—"}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-ink-500">Cần sửa thông tin hoặc số tài khoản ngân hàng đã khai? Vui lòng liên hệ nhân viên Vexim để được hỗ trợ.</p>
    </section>
    <section className="mt-5 rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-lg font-bold text-ink-900">Kiểm tra giấy tờ</h2>
      <p className="mt-1 text-sm text-ink-600">Vexim sẽ kiểm tra giấy tờ; AI chỉ đưa gợi ý cho nhân viên. Người có quyền duyệt của Vexim mới xác nhận kết quả.</p>
      <p className="mt-3 text-sm font-semibold text-ink-700">Trạng thái: {review?.status === "approved" ? "Đã duyệt" : review?.status === "returned" ? "Vexim yêu cầu bổ sung" : review?.status === "submitted" ? "Chờ Vexim duyệt" : "Đang rà soát"}</p>
      {mine.length > 0 && <ul className="mt-4 space-y-2 text-sm">{mine.map((m) =>
        <li key={m.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-ink-50 px-3 py-2">
          <span>{L1_DOC_ITEMS.find((item) => item.key === m.checklist_key)?.label ?? "Giấy tờ"}: {m.caption}</span>
          <a href={`/api/media/file/${m.storage_path}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">Xem tệp</a>
        </li>)}</ul>}
      {review && (review.status === "in_progress" || review.status === "returned")
        ? <SupplierPortalUpload />
        : <p className="mt-4 text-sm text-ink-500">Đợt kiểm hiện không nhận thêm tệp. Liên hệ Vexim nếu cần bổ sung.</p>}
    </section>
    <section className="mt-5 rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-lg font-bold text-ink-900">Đánh giá bổ sung đã yêu cầu</h2>
      {requests.length ? <ul className="mt-3 space-y-2 text-sm text-ink-700">{requests.map((r) => <li key={r.target_level}>
        {r.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng"} — {reviews.some((v) => v.target_level === r.target_level && v.status === "approved") ? "Đã được Vexim duyệt sau đánh giá" : r.status === "contacted" ? "Vexim đã ghi nhận liên hệ, chưa duyệt" : "Vexim sẽ liên hệ để lên kế hoạch, chưa duyệt"}
      </li>)}</ul> : <p className="mt-2 text-sm text-ink-500">Bạn chưa chọn thêm đánh giá tại thời điểm đăng ký.</p>}
      <p className="mt-3 text-xs text-ink-500">Chỉ nhân viên Vexim được thu thập/tải bằng chứng và duyệt các đánh giá này. Chưa có đánh giá nào được tự động cấp nhãn.</p>
    </section>
  </main>;
}
