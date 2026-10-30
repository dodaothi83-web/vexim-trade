import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { effectiveFieldsFor } from "@/lib/product-attributes";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { previewLegacyProductForms } from "@/lib/products/product-form-legacy-preview";
import { LegacyProductFormPreview } from "@/components/products/legacy-product-form-preview";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Đối chiếu sản phẩm với form mới", robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown) => value == null || value === "" ? "Chưa xác định" : typeof value === "string" ? value : JSON.stringify(value, null, 2);

/** A strictly read-only view, including for multi-grade legacy products. */
export default async function LegacyProductMappingPreview({ params, searchParams }: {
  params: Promise<{ slug: string }>; searchParams: Promise<{ grade?: string | string[] }>;
}) {
  const { slug: id } = await params;
  const session = await requirePagePermission("products.manage", "/crm/products");
  if (!UUID.test(id) || !getSupabaseClient()) notFound();
  const actor = await supabaseStore.getUser(session.uid);
  if (!actor?.is_active || actor.role !== session.role || !["admin", "reviewer"].includes(actor.role) ||
      actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase()) notFound();
  const product = await supabaseStore.getProduct(id);
  if (!product) notFound();
  const [supplier, categories, media] = await Promise.all([
    supabaseStore.getSupplier(product.supplier_id), supabaseStore.listCategories({ publishedOnly: false }),
    supabaseStore.listMedia("product", product.id),
  ]);
  if (!supplier) notFound();
  const options = categoryProposalOptions(categories);
  // Category text on legacy products may be a free-text industry. Only an
  // explicitly reviewed, currently published category is used as a mapping.
  const reviewed = options.find((item) => item.slug === product.reviewed_category_slug);
  const category = reviewed ? categories.find((item) => item.id === reviewed.id) : undefined;
  const result = previewLegacyProductForms({ product, categorySlug: reviewed?.slug ?? "",
    fields: effectiveFieldsFor(category), standardGrades: standardGradesForCategory(category ?? null) });
  const query = await searchParams;
  const index = typeof query.grade === "string" && /^\d{1,2}$/.test(query.grade) ? Number(query.grade) : 0;
  const selected = result.ok && index < result.candidates.length ? index : 0;
  const original = [
    ["Tên gốc", product.name], ["Tên hiển thị", product.display_name], ["Các tên theo ngôn ngữ", product.name_i18n],
    ["Danh mục cũ", product.category], ["Danh mục đã duyệt", product.reviewed_category_slug],
    ["Quy cách gốc", product.spec], ["Các bản dịch quy cách", product.spec_i18n],
    ["Mô tả gốc", product.description], ["Các bản dịch mô tả", product.description_i18n],
    ["Mô tả chi tiết gốc", product.description_detail], ["Các bản dịch mô tả chi tiết", product.description_detail_i18n],
    ["Dấu vết dịch", product.translation_meta], ["Thông số gốc", product.specs],
    ["Bao bì gốc", product.packaging], ["Các bản dịch bao bì", product.packaging_i18n],
    ["MOQ gốc", product.moq], ["Số lượng MOQ", product.moq_qty], ["Đơn vị MOQ", product.moq_unit],
    ["Năng lực gốc", product.monthly_capacity], ["Chứng nhận gốc", product.certifications], ["Chứng nhận tiếng Anh", product.certifications_i18n],
    ["Giá demo từ", product.ref_price], ["Giá demo đến", product.ref_price_max], ["Tiền tệ gốc", product.currency], ["Đơn vị giá gốc", product.unit],
    ["Hiện giá gốc", product.price_publicly_visible], ["Ngày hết hạn giá gốc", product.price_valid_until],
    ["Trạng thái sản phẩm", product.supplier_review_status], ["Sẵn sàng cho buyer", product.ready_for_buyer],
    ["Ảnh/tệp gốc", `${media.length} tệp trong hồ sơ gốc`], ["Cập nhật gốc", product.updated_at],
  ] as const;
  return <>
    <PageHeader title="Đối chiếu sản phẩm với form mới" sub={`${product.name || "Sản phẩm chưa có tên"} · ${supplier.name}`} />
    <Link href={`/crm/products/${encodeURIComponent(product.id)}/edit`} className="text-sm font-semibold text-brand-700 underline">Quay lại hồ sơ gốc</Link>
    <div className="mt-4 space-y-5">
      <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Chỉ xem đối chiếu, chưa tạo bản nháp, tách sản phẩm hay thay đổi dữ liệu. Bảng giá mới để trống; doanh nghiệp sẽ nhập giá chính thức. Hồ sơ, ảnh và liên kết gốc hiện vẫn giữ nguyên.
      </p>
      {!reviewed && <p role="alert" className="rounded-lg border border-amber-200 bg-white p-4 text-sm">Danh mục chưa có mã được duyệt và đang mở; không tự suy đoán từ tên hay ngành hàng cũ.</p>}
      <details className="rounded-xl border border-ink-200 bg-white p-4" open>
        <summary className="cursor-pointer font-semibold">Dữ liệu gốc cần đối chiếu</summary>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{original.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-ink-50 p-3">
          <dt className="font-semibold text-ink-700">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-ink-900">{text(value)}</dd>
        </div>)}</dl>
        <p className="mt-3 text-xs text-ink-600">Các giá demo trên chỉ phản ánh hồ sơ đang tồn tại, không được chép sang bảng giá mới.</p>
      </details>
      {!result.ok ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        {result.reason === "ambiguous_grade" ? "Grade gốc bị trùng, mâu thuẫn hoặc không rõ; cần kiểm tra dữ liệu gốc trước khi tạo form." :
          result.reason === "too_many_grades" ? "Có quá nhiều grade để đối chiếu an toàn trên màn hình này." :
          "Một hoặc nhiều trường cũ không phù hợp cấu trúc form mới; cần kiểm tra dữ liệu gốc, không tự cắt bỏ."}
      </p> : <>
        <section className="rounded-xl border border-ink-200 bg-white p-4">
          <h2 className="font-semibold">Các form dự kiến · {result.candidates.length}</h2>
          <p className="mt-1 text-sm text-ink-600">Mỗi grade là một sản phẩm dự kiến. Đây chưa phải sản phẩm đã tạo; tên và mô tả dùng chung cần kiểm tra lại cho từng grade.</p>
          {result.candidates.length > 1 && <nav aria-label="Chọn grade đối chiếu" className="mt-3 flex flex-wrap gap-2">
            {result.candidates.map((candidate, i) => <Link key={i} aria-current={i === selected ? "page" : undefined}
              className={`rounded-lg border px-3 py-2 text-sm ${i === selected ? "border-brand-700 bg-brand-50 font-semibold" : "border-ink-200"}`}
              href={`/crm/products/${encodeURIComponent(product.id)}/mapping-preview?grade=${i}`}>{candidate.grade ?? `Grade ${i + 1}`}</Link>)}
          </nav>}
          <p className="mt-3 text-sm">Đang xem: <strong>{result.candidates[selected].grade ?? "Chưa xác định grade"}</strong></p>
          {result.unrepresentedMonthlyCapacity && <p className="mt-2 text-sm text-amber-800">Năng lực cũ chưa rõ đơn vị, không tự chuyển sang kg/tháng.</p>}
          {result.requiresStaffCertificationReview && <p className="mt-2 text-sm text-amber-800">Chứng nhận cũ cần nhân viên đối chiếu riêng.</p>}
          {result.unrepresentedSpecKeys.length > 0 && <p className="mt-2 text-sm text-amber-800">Thông số chưa đưa vào form: {result.unrepresentedSpecKeys.join(", ")}.</p>}
          {result.candidates[selected].originalRow != null && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Dòng grade gốc</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-ink-50 p-3">{text(result.candidates[selected].originalRow)}</pre></details>}
        </section>
        <LegacyProductFormPreview draft={result.candidates[selected].draft} categories={options} />
      </>}
    </div>
  </>;
}
