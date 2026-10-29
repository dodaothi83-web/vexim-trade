import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { PageHeader } from "@/components/page-header";
import { readQuantityRevisionV2, v2PriceLabel, v2QuantityLabel } from "@/lib/products/quantity-revision-v2";
import { QuantityReviewControls } from "./review-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rà soát giá và tên sản phẩm" };

type Revision = { id: string; product_id: string; created_at: string; product_updated_at: string | null; product_context?: unknown;
  grade?: string; incoterm?: string; tiers?: unknown; warnings?: unknown; source_name?: string; english_name?: string; origin?: string };

export default async function QuantityReviewPage() {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "reviewer") redirect("/crm/products");
  let prices: Revision[] = [], names: Revision[] = [];
  let products: Awaited<ReturnType<typeof supabaseStore.listProducts>> = [];
  let suppliers: Awaited<ReturnType<typeof supabaseStore.listSuppliers>> = [];
  let failed = false;
  try {
    const db = getSupabaseClient();
    if (!db) throw new Error("Database unavailable");
    const actor = await supabaseStore.getUser(session.uid);
    if (!actor?.is_active || actor.role !== session.role || actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) throw new Error("Staff verification failed");
    async function pending(table: string): Promise<Revision[]> {
      const rows: Revision[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await db!.from(table).select("*").eq("status", "pending")
          .order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 499);
        if (error || !data) throw new Error(error?.message ?? "Review queue unavailable");
        rows.push(...data as Revision[]);
        if (data.length < 500) return rows;
      }
    }
    [prices, names, products, suppliers] = await Promise.all([
      pending("product_quantity_price_revisions"), pending("product_english_name_revisions"),
      supabaseStore.listProducts(), supabaseStore.listSuppliers(),
    ]);
  } catch (error) {
    console.error("[quantity-review] load queue", error);
    failed = true;
  }
  const productsById = new Map(products.map((product) => [product.id, product]));
  const suppliersById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const renderQueue = (revisions: Revision[], kind: "price" | "name") => <section className="rounded-xl border border-ink-200 bg-white p-5">
    <h2 className="font-bold text-ink-900">{kind === "price" ? "Giá chờ rà soát" : "Tên tiếng Anh chờ duyệt"} <span className="text-ink-500">({revisions.length})</span></h2>
    {!revisions.length ? <p className="mt-3 text-sm text-ink-500">Không có bản chờ duyệt.</p> : <div className="mt-3 space-y-4">{revisions.map((revision) => {
      const product = productsById.get(revision.product_id);
      const supplier = product ? suppliersById.get(product.supplier_id) : null;
      const rows = Array.isArray(revision.tiers) ? revision.tiers : [];
      const versioned = rows.some((row) => row && typeof row === "object" && "version" in row);
      const v2 = versioned ? readQuantityRevisionV2(rows) : null;
      const warnings = Array.isArray(revision.warnings) ? revision.warnings : [];
      return <article key={revision.id} className="rounded-lg border border-ink-200 p-4 text-sm">
        <p className="font-semibold text-ink-900">{product?.name ?? "Sản phẩm không còn tồn tại"}</p>
        <p className="mt-1 text-xs text-ink-600">NCC: {supplier?.name ?? "Không xác định"} · Gửi: {revision.created_at ? new Date(revision.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Không xác định"}</p>
        {product && <Link href={`/crm/products/${product.id}/edit`} className="mt-1 inline-block text-xs font-semibold text-brand-700 underline">Mở hồ sơ sản phẩm</Link>}
        {kind === "price" ? <div className="mt-3 text-xs">
          <p>Grade: <strong>{revision.grade || "—"}</strong> · Incoterm: <strong>{revision.incoterm || "—"}</strong></p>
          {v2?.customGrade && <p className="mt-1 text-ink-600">Grade do NCC tự nhập, không thuộc bộ lọc grade chuẩn.</p>}
          {versioned && !v2 ? <p role="alert" className="mt-2 text-rose-700">Dữ liệu bảng giá không hợp lệ. Không thể duyệt.</p> : <table className="mt-2 w-full text-left"><thead><tr><th className="py-1">{v2 ? "Số lượng từ" : "Số lượng từ (kg)"}</th><th className="py-1">{v2 ? "Giá theo đơn vị gốc" : "Giá (USD/kg)"}</th></tr></thead>
            <tbody>{v2 ? v2.tiers.map((row, index) => <tr key={index} className="border-t border-ink-100"><td className="py-1 tabular-nums">{v2QuantityLabel(row.quantityGrams, v2)}</td><td className="py-1 tabular-nums">{v2PriceLabel(row.priceCentsPerUnit, v2.unit)}</td></tr>) : rows.map((raw, index) => { const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; return <tr key={index} className="border-t border-ink-100"><td className="py-1 tabular-nums">{typeof row.minKg === "number" ? row.minKg.toLocaleString("en-US") : "Không hợp lệ"}</td><td className="py-1 tabular-nums">{typeof row.priceUsdPerKg === "number" ? row.priceUsdPerKg.toFixed(2) : "Không hợp lệ"}</td></tr>; })}</tbody></table>}
          {warnings.length > 0 && <p className="mt-2 font-semibold text-amber-800">Có mức giá ngoài ngưỡng cấu hình, cần đối chiếu trước khi duyệt.</p>}
        </div> : <div className="mt-3 space-y-1 text-xs"><p>Tên gốc: {revision.source_name || "—"}</p><p>Tên buyer đề xuất: <strong>{revision.english_name || "—"}</strong></p><p>Nguồn: {revision.origin || "—"}</p></div>}
        {product && revision.product_updated_at !== product.updated_at && <p className="mt-2 text-xs font-semibold text-amber-800">{revision.product_context ? "Sản phẩm đã được cập nhật sau khi gửi; hệ thống sẽ kiểm tra các thay đổi liên quan khi duyệt." : "Sản phẩm đã đổi sau khi gửi. Cần từ chối và yêu cầu NCC gửi lại."}</p>}
        {product && <QuantityReviewControls productId={product.id} revisionId={revision.id} updatedAt={product.updated_at} kind={kind} />}
      </article>;
    })}</div>}
  </section>;
  return <>
    <PageHeader title="Rà soát giá và tên sản phẩm" sub="Hai hàng chờ độc lập; thao tác không thay đổi trạng thái duyệt nội dung sản phẩm." />
    <Link href="/crm/products" className="text-sm font-semibold text-brand-700">← Về danh sách sản phẩm</Link>
    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Form NCC đã dùng bảng giá mới. Hiển thị buyer theo mô hình mới chưa được bật mặc định; duyệt tại đây không thay đổi giá hoặc tên buyer đang thấy khi chưa bật mô hình.</p>
    {failed ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Chưa tải được hàng chờ. Kiểm tra kết nối và các migration 20261053–20261056.</p> : <div className="mt-4 grid items-start gap-5 xl:grid-cols-2">{renderQueue(prices, "price")}{renderQueue(names, "name")}</div>}
  </>;
}
