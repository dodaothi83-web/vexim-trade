import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireProductFormReviewer } from "./reviewer-access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bản gửi sản phẩm" };

export default async function ProductFormReviewQueue({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { db } = await requireProductFormReviewer();
  const requested = Number((await searchParams).page ?? "1");
  const page = Number.isSafeInteger(requested) && requested >= 1 && requested <= 10_000 ? requested : 1;
  const perPage = 50, offset = (page - 1) * perPage;
  const { data, error } = await db.from("product_form_submissions")
    .select("id,product_id,created_at,payload")
    .eq("status", "pending").order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + perPage);
  if (error || !Array.isArray(data)) return <>
    <PageHeader title="Bản gửi sản phẩm" />
    <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Không tải được bản gửi. Hãy thử lại.</p>
  </>;
  const rows = data.slice(0, perPage);
  return <>
    <PageHeader title="Bản gửi sản phẩm" sub="Đối chiếu thông tin NCC gửi với sản phẩm đang công khai." />
    <Link href="/crm/products" className="text-sm font-semibold text-brand-700">Về danh sách sản phẩm</Link>
    <section className="mt-4 rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="font-semibold text-ink-900">Đang chờ kiểm tra</h2>
      {!rows.length ? <p className="mt-3 text-sm text-ink-500">Không có bản gửi trong trang này.</p> :
        <ul className="mt-3 divide-y divide-ink-100">{rows.map((row) => {
          const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {};
          const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Sản phẩm chưa có tên";
          const date = typeof row.created_at === "string" ? new Date(row.created_at) : null;
          return <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div><p className="font-semibold text-ink-900">{name}</p><p className="mt-1 text-xs text-ink-500">Gửi: {date && Number.isFinite(date.valueOf()) ? date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Không xác định"}</p></div>
            <Link href={`/crm/products/form-review/${encodeURIComponent(row.id)}`} className="btn btn-soft">Xem bản gửi</Link>
          </li>;
        })}</ul>}
      {(page > 1 || data.length > perPage) && <nav aria-label="Phân trang bản gửi" className="mt-4 flex items-center gap-4 text-sm">
        {page > 1 && <Link className="font-semibold text-brand-700" href={`/crm/products/form-review?page=${page - 1}`}>Trang trước</Link>}
        <span>Trang {page}</span>
        {data.length > perPage && page < 10_000 && <Link className="font-semibold text-brand-700" href={`/crm/products/form-review?page=${page + 1}`}>Trang sau</Link>}
      </nav>}
    </section>
  </>;
}
