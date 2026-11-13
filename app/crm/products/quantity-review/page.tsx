import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { readQuantityRevisionV2, v2PriceLabel, v2QuantityLabel } from "@/lib/products/quantity-revision-v2";
import { QuantityReviewControls } from "./review-controls";
import { normalizeSalesUnit, salesUnitLabel } from "@/lib/products/sales-units";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rà soát giá và tên sản phẩm" };

type Revision = { id: string; product_id: string; created_at: string; product_updated_at: string | null; product_context?: unknown;
  grade?: string; incoterm?: string; tiers?: unknown; warnings?: unknown; source_name?: string; english_name?: string; origin?: string };

export default async function QuantityReviewPage({ searchParams }: {
  searchParams: Promise<{ product_id?: string | string[] }>;
}) {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "reviewer") redirect("/crm/products");
  const params = await searchParams;
  const productId = typeof params.product_id === "string" ? params.product_id : null;
  // Invalid scoped links must never silently fall back to the global queue.
  if (params.product_id !== undefined && (!productId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId))) redirect("/crm/products");
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
        let query = db!.from(table).select("*").eq("status", "pending");
        if (productId) query = query.eq("product_id", productId);
        const { data, error } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 499);
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
  const renderQueue = (revisions: Revision[], kind: "price" | "name") => <section className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
    <h2 className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-4 text-sm font-bold text-ink-900">{kind === "price" ? "Giá chờ rà soát" : "Tên tiếng Anh chờ duyệt"} <span className="rounded-full bg-white px-2 py-0.5 text-xs text-ink-500 ring-1 ring-ink-200">{revisions.length}</span></h2>
    {!revisions.length ? <p className="mt-3 text-sm text-ink-500">Không có bản chờ duyệt.</p> : <div className="divide-y divide-ink-100">{revisions.map((revision) => {
      const product = productsById.get(revision.product_id);
      const supplier = product ? suppliersById.get(product.supplier_id) : null;
      const rows = Array.isArray(revision.tiers) ? revision.tiers : [];
      const versioned = rows.some((row) => row && typeof row === "object" && "version" in row);
      const v2 = versioned ? readQuantityRevisionV2(rows) : null;
      const warnings = Array.isArray(revision.warnings) ? revision.warnings : [];
      const legacyRows = rows.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
      const legacyCurrency = typeof legacyRows.find((row) => typeof row.currency === "string")?.currency === "string"
        ? String(legacyRows.find((row) => typeof row.currency === "string")!.currency) : "USD";
      // Kg tables store no unit; count-unit tables (lon, chai…) store it on every tier.
      const legacyUnit = salesUnitLabel(normalizeSalesUnit(legacyRows.find((row) => "unit" in row)?.unit) ?? "kg");
      const legacyIncoterms = [...new Set(legacyRows.map((row) => typeof row.incoterm === "string" ? row.incoterm : "").filter(Boolean))].join(" / ");
      return <article key={revision.id} className="p-5 text-sm sm:p-6">
        <p className="text-base font-bold leading-relaxed text-ink-900">{product?.name ?? "Sản phẩm không còn tồn tại"}</p>
        <p className="mt-1 text-xs text-ink-600">Nhà cung cấp: {supplier?.name ?? "Không xác định"} · Gửi: {revision.created_at ? new Date(revision.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Không xác định"}</p>
        {product && <Link href={`/crm/products/${product.id}/edit`} className="mt-1 inline-block text-xs font-semibold text-brand-700 underline">Review sản phẩm →</Link>}
        {kind === "price" ? <div className="mt-3 text-xs">
          <p>Grade: <strong>{revision.grade || "—"}</strong> · Incoterm: <strong>{legacyIncoterms || revision.incoterm || "—"}</strong> · Tiền tệ: <strong>{legacyCurrency}</strong>{!v2 && <> · Đơn vị: <strong>{legacyUnit}</strong></>}</p>
          {v2?.customGrade && <p className="mt-1 text-ink-600">Grade do nhà cung cấp tự nhập, không thuộc bộ lọc grade chuẩn.</p>}
          {versioned && !v2 ? <p role="alert" className="mt-2 text-rose-700">Dữ liệu bảng giá không hợp lệ. Không thể duyệt.</p> : <table className="mt-4 w-full text-left text-sm"><thead><tr><th className="py-2 text-ink-500">{v2 ? "Số lượng từ" : `Số lượng từ (${legacyUnit})`}</th>{!v2 && <th className="py-2 text-ink-500">Incoterm</th>}<th className="py-2 text-ink-500">{v2 ? "Giá theo đơn vị gốc" : `Giá (${legacyCurrency}/${legacyUnit})`}</th></tr></thead>
            <tbody>{v2 ? v2.tiers.map((row, index) => <tr key={index} className="border-t border-ink-100"><td className="py-3 tabular-nums">{v2QuantityLabel(row.quantityGrams, v2)}</td><td className="py-3 tabular-nums">{v2PriceLabel(row.priceCentsPerUnit, v2.unit)}</td></tr>) : rows.map((raw, index) => { const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}; return <tr key={index} className="border-t border-ink-100"><td className="py-3 tabular-nums">{typeof row.minKg === "number" ? row.minKg.toLocaleString("en-US") : "Không hợp lệ"}</td><td className="py-2 text-ink-500">{typeof row.incoterm === "string" ? row.incoterm : revision.incoterm || "—"}</td><td className="py-3 tabular-nums">{typeof row.priceUsdPerKg === "number" ? row.priceUsdPerKg.toFixed(2) : "Không hợp lệ"}</td></tr>; })}</tbody></table>}
          {warnings.length > 0 && <p className="mt-2 font-semibold text-amber-800">Có mức giá ngoài ngưỡng cấu hình, cần đối chiếu trước khi duyệt.</p>}
        </div> : <div className="mt-3 space-y-1 text-xs"><p>Tên gốc: {revision.source_name || "—"}</p><p>Tên tiếng Anh đề xuất: <strong>{revision.english_name || "—"}</strong></p><p>Nguồn: {revision.origin || "—"}</p></div>}
        {product && revision.product_updated_at !== product.updated_at && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{revision.product_context ? "Sản phẩm đã được cập nhật sau khi gửi; hệ thống sẽ kiểm tra các thay đổi liên quan khi duyệt." : "Sản phẩm đã đổi sau khi gửi. Cần từ chối và yêu cầu nhà cung cấp gửi lại."}</p>}
        {product && <QuantityReviewControls productId={product.id} revisionId={revision.id} updatedAt={product.updated_at} kind={kind} approvalDisabled={(versioned && !v2 && kind === "price") || (!revision.product_context && revision.product_updated_at !== product.updated_at)} />}
      </article>;
    })}</div>}
  </section>;
  const total = prices.length + names.length;
  return <div className="mx-auto w-full max-w-4xl space-y-5 pb-8">
    <nav aria-label="Điều hướng duyệt" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <Link href={productId ? `/crm/products/${productId}/edit` : "/crm/products"} className="font-semibold text-brand-700 hover:underline">
        ← {productId ? "Review sản phẩm" : "Danh sách sản phẩm"}
      </Link>
      {productId && <Link href="/crm/products/quantity-review" className="text-ink-500 hover:text-brand-700 hover:underline">Toàn bộ hàng chờ →</Link>}
    </nav>
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black tracking-tight text-ink-900">Duyệt giá & tên sản phẩm</h1>
        {!failed && total > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-inset ring-amber-200">{total} chờ duyệt</span>}
      </div>
      <p className="text-sm leading-relaxed text-ink-500">Kiểm tra đề xuất bên dưới. Sau khi duyệt, quay lại Review sản phẩm để hoàn tất việc đăng.</p>
    </header>
    {failed ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Chưa tải được hàng chờ. Vui lòng tải lại trang để thử lại.</p>
      : total === 0 ? <section role="status" className="rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center shadow-sm">
        <h2 className="text-lg font-bold text-ink-900">Không còn đề xuất chờ duyệt</h2>
        <p className="mt-2 text-sm text-ink-500">{productId ? "Tiếp tục kiểm tra nội dung và duyệt đăng sản phẩm." : "Các đề xuất giá và tên đã được xử lý."}</p>
        <Link href={productId ? `/crm/products/${productId}/edit` : "/crm/products"} className="btn btn-primary mt-5">{productId ? "Về Review sản phẩm" : "Về danh sách sản phẩm"}</Link>
      </section>
      : <div className="space-y-5">{prices.length > 0 && renderQueue(prices, "price")}{names.length > 0 && renderQueue(names, "name")}
        <p className="px-1 text-xs leading-relaxed text-ink-500">Duyệt đề xuất không tự động đăng sản phẩm hoặc thay giá đang hiển thị cho người mua.</p>
      </div>}
  </div>;
}
