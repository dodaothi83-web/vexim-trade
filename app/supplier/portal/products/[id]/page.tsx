import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { supplierPortalAccess } from "@/lib/supplier-portal/access";
import { getSupabaseClient, supabaseStore } from "@/lib/db/supabase";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { supplierVisibleProductMedia } from "@/lib/supplier-portal/product-view";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";
import { PageHeader } from "@/components/page-header";
import { SupplierProductEditor } from "../product-editor";
import { readQuantityEditorData } from "@/lib/products/quantity-editor-data";
import { isSyntheticProductFormStaging } from "@/lib/products/product-form-staging-access";
import { loadProductFormDraftAction } from "@/app/supplier/portal/product-form-draft-actions";
import { readNewQuantityPolicies } from "@/lib/products/quantity-new-config";
import { SupplierProductFormStagingEditor } from "../product-form-staging-editor";
import { seedLegacyProductFormEdit } from "@/lib/products/product-form-legacy-edit-seed";
import { fieldsFor, supplierFieldsFor } from "@/lib/product-attributes";
import { standardGradesForCategory } from "@/lib/products/grade-pricing";
import { sanitizeProductDescriptionForSave } from "@/lib/products/product-description";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản lý sản phẩm", robots: { index: false, follow: false } };

/** `?step=2|3` cho phép mở thẳng một bước sau khi lưu sản phẩm mới. */
function readStep(raw: string | undefined): 1 | 2 | 3 {
  const value = Number(raw);
  return value === 2 ? 2 : value === 3 ? 3 : 1;
}

export default async function OwnProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const access = await supplierPortalAccess();
  if (!access) redirect("/login");
  if (!portalApproved(access.supplier)) redirect("/supplier/portal");
  const { id } = await params;
  const step = readStep((await searchParams).step);
  const product = await access.store.getProduct(id);
  if (!product || product.supplier_id !== access.supplier.id) notFound();
  const [allMedia, allCategories] = await Promise.all([
    access.store.listMedia("product", id), access.store.listCategories({ publishedOnly: true }),
  ]);
  const media = supplierVisibleProductMedia(allMedia, access.supplier.id, access.user.id);
  const options = categoryProposalOptions(allCategories);
  if (isSyntheticProductFormStaging()) {
    const draftResult = await loadProductFormDraftAction(id);
    if (!draftResult.ok) return <><PageHeader title={product.name || "Quản lý sản phẩm"} />
      <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{draftResult.message}</p></>;
    if (draftResult.draft) {
      const policies = await readNewQuantityPolicies(options).catch(() => null);
      return <><PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title={draftResult.draft.name || "Quản lý sản phẩm"}
        sub="Hoàn thiện thông tin sản phẩm và theo dõi phản hồi duyệt." />
        {draftResult.stale && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Sản phẩm đã thay đổi sau khi tạo bản nháp. Nội dung nháp vẫn được giữ; hãy liên hệ Vexim để đối chiếu trước khi tiếp tục.</p>}
        {policies ? <SupplierProductFormStagingEditor initialDraft={draftResult.draft} productId={id} revision={draftResult.revision}
          images={draftResult.images ?? []} availableImages={draftResult.availableImages} pending={draftResult.pending}
          readOnly={draftResult.stale || (draftResult.pending && !["approved", "paused"].includes(product.supplier_review_status ?? ""))}
          categories={options} policies={policies} /> :
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">Không tải được cấu hình bảng giá. Hãy tải lại trang.</p>}</>;
    }
    // Existing products remain untouched until a private draft is saved. Never
    // infer legacy price tiers or choose a grade from an ambiguous/multi-grade
    // product. Those records keep their original editor and public projection.
    const slug = product.reviewed_category_slug || product.supplier_category_proposal || product.category;
    const category = options.find((option) => option.slug === slug);
    if (category && ["draft", "changes_requested", "approved", "paused"].includes(product.supplier_review_status ?? "")) {
      const seed = seedLegacyProductFormEdit({ product, categorySlug: category.slug,
        fields: [...fieldsFor(category), ...supplierFieldsFor(category)], standardGrades: standardGradesForCategory(category) });
      if (seed.ok) {
        let safeDescription = false;
        try { safeDescription = sanitizeProductDescriptionForSave(seed.draft.descriptionDetail) === seed.draft.descriptionDetail; }
        catch { safeDescription = false; }
        if (!safeDescription) return <><PageHeader title={product.name || "Quản lý sản phẩm"} />
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Mô tả chi tiết cũ cần Vexim kiểm tra trước khi tạo bản nháp. Nội dung đang công khai vẫn được giữ nguyên.</p></>;
        const policies = await readNewQuantityPolicies(options).catch(() => null);
        return <><PageHeader eyebrow="Cổng nhà cung cấp · riêng tư" title={product.name || "Quản lý sản phẩm"}
          sub="Tạo bản nháp mới mà không thay đổi nội dung đang công khai." />
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>Giá cũ và nội dung đã duyệt vẫn giữ nguyên. Hãy nhập lại bảng giá và chọn ảnh cho bản nháp.</p>
            {(seed.unrepresentedMonthlyCapacity || seed.unrepresentedSpecKeys.length > 0 || seed.requiresStaffCertificationReview) &&
              <p className="mt-2">Một số thông tin cũ cần Vexim kiểm tra để giữ lại khi duyệt. Không tự đổi đơn vị hoặc xóa dữ liệu cũ.</p>}
          </div>
          {policies ? <SupplierProductFormStagingEditor initialDraft={seed.draft} productId={id} revision={0}
            images={[]} availableImages={draftResult.availableImages} categories={options} policies={policies} /> :
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">Không tải được cấu hình bảng giá. Hãy tải lại trang.</p>}</>;
      }
    }
  }
  const linked = access.supplier.requested_category_slugs?.length ? [] : await access.store.listSupplierCategories(access.supplier.id);
  const categoryScope = allowedSupplierCategories(access.supplier, options, linked).map((item) => item.slug);
  const quantityEditor = await (async () => {
    if (!getSupabaseClient()) return null;
    const strictAccess = await supplierPortalAccess(supabaseStore);
    if (!strictAccess || !portalApproved(strictAccess.supplier) || strictAccess.supplier.id !== access.supplier.id) return null;
    const strictProduct = await supabaseStore.getProduct(id);
    if (!strictProduct || strictProduct.supplier_id !== strictAccess.supplier.id) return null;
    return readQuantityEditorData(strictProduct);
  })().catch((error) => {
    console.error("[quantity-pricing] supplier editor", error);
    return null;
  });
  return <>
    <PageHeader
      eyebrow="Cổng nhà cung cấp · riêng tư"
      title={product.name}
      sub="Hoàn thiện thông tin, kiểm tra tệp đã tải và theo dõi phản hồi duyệt."
      breadcrumbs={<nav aria-label="Đường dẫn" className="flex min-w-0 items-center gap-1.5 text-xs text-ink-500"><Link href="/supplier/portal/products" className="shrink-0 hover:text-brand-700">Sản phẩm</Link><ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate font-semibold text-ink-800">{product.name}</span></nav>}
    />
    {process.env.VEXIM_QUANTITY_PRICING_PREVIEW === "true" && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <Link href={`/supplier/portal/products/${id}/quantity-pricing`} className="font-semibold underline">Mở trang thử nghiệm giá theo số lượng</Link>. Trang thử nghiệm chưa thay đổi thông tin buyer đang thấy.
    </p>}
    <SupplierProductEditor product={product} quantityEditor={quantityEditor} media={media} userId={access.user.id} categories={options} categoryScope={categoryScope} supplier={access.supplier} initialStep={step} />
  </>;
}
