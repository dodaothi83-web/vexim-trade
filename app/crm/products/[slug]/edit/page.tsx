import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Minus } from "lucide-react";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { assignProductCategory, assignSupplierCategories } from "@/lib/public/category-assignment";
import { isTestOnlyProduct, productReviewApproved, productPriceBlockers, publicProductPrice } from "@/lib/public/product-selection";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { DeleteProductButton } from "@/components/product-actions";
import { MediaManager, ReadyHint } from "@/components/media-manager";
import { isExpired, productReadiness } from "@/lib/media/readiness";
import { requirePagePermission } from "@/lib/auth/session";
import { SupplierProductReviewControls } from "./review-controls";
import { ProductTranslationPanel } from "./translation-panel";
import { productTranslationState } from "@/lib/ai/translate-content";
import { categoryProposalOptions, allowedSupplierCategories } from "@/lib/supplier-portal/category-proposals";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sửa hồ sơ sản phẩm" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: id } = await params;
  const session = await requirePagePermission("products.manage", "/crm/products");
  const store = getStore();
  const product = await store.getProduct(id);
  if (!product) notFound();
  const supplier = await store.getSupplier(product.supplier_id);
  if (!supplier) notFound();
  const [media, categories] = await Promise.all([store.listMedia("product", id), store.listCategories({ publishedOnly: false })]);
  const readiness = productReadiness(media);
  const links = await store.listSupplierCategories(supplier.id).catch(() => []);
  const supplierCategories = links.length
    ? links.map((link) => categories.find((c) => c.id === link.category_id)?.slug).filter((slug): slug is string => !!slug)
    : assignSupplierCategories(supplier.products, [], categories).slugs;
  const match = product.reviewed_category_slug
    ? categories.find((c) => c.slug === product.reviewed_category_slug) ?? null
    : assignProductCategory(product, categories, supplierCategories);
  const category = categories.find((c) => c.id === match?.id);
  const linked = supplier.requested_category_slugs?.length ? [] : await store.listSupplierCategories(supplier.id);
  const categoryOptions = categoryProposalOptions(categories);
  const supplierCategoryScope = allowedSupplierCategories(supplier, categoryOptions, linked).map((item) => item.slug);
  const inferredCategory = assignProductCategory({ name: product.name, spec: product.spec, description: product.description, category: null }, categories);
  const categoryPublished = !!category && category.status === "published" && category.is_published;
  // Match the category catalog: a published test profile is still not a real commercial supplier.
  const commercialSupplier = !isSyntheticSupplier(supplier) ||
    (!!supplier.is_demo && process.env.VEXIM_SHOW_DEMO === "true");
  const supplierReviewedListing = !!(product.supplier_originated || product.supplier_category_proposal);
  const needsPublicationRetry = supplierReviewedListing && product.supplier_review_status === "approved" && !product.ready_for_buyer;
  const needsPublicationAction = supplierReviewedListing && (product.supplier_review_status === "pending" || needsPublicationRetry);
  const canView = productReviewApproved(product) && supplier.status === "published" && categoryPublished &&
    commercialSupplier &&
    (supplier.is_demo ? process.env.VEXIM_SHOW_DEMO === "true" : product.ready_for_buyer && readiness.ready) &&
    !isTestOnlyProduct(product.name);
  const productImages = media.filter((m) => m.kind === "image" && m.audience === "buyer" && m.storage_path && !isExpired(m));
  const priceBlockers = productPriceBlockers(product, supplier);
  const visiblePrice = canView && !priceBlockers.length ? publicProductPrice(product, supplier) : null;

  const translationState = productTranslationState(product);
  const websiteChecks: Array<{ done: boolean; label: string; automatic?: boolean }> = supplierReviewedListing ? [
    { done: categoryPublished, label: `Danh mục ${category?.name_i18n.en || category?.slug || "chưa nhận diện"} đang xuất bản` },
    { done: supplier.status === "published", label: "Hồ sơ NCC đang công khai" },
    { done: commercialSupplier, label: "Hồ sơ không phải dữ liệu thử nghiệm" },
    { done: readiness.ready, label: "Có ảnh hoặc catalogue chia sẻ cho buyer", automatic: needsPublicationAction },
    { done: productReviewApproved(product) && !!product.ready_for_buyer, label: "Sản phẩm đã được duyệt và đăng", automatic: needsPublicationAction },
    { done: !isTestOnlyProduct(product.name), label: "Tên sản phẩm không phải dữ liệu thử nghiệm" },
  ] : [
    // CRM-created products keep their existing checklist and manual posting flow.
    { done: translationState.current, label: translationState.hasEnglish ? "Đã có bản dịch tiếng Anh khớp nội dung gốc (AI dịch, nhân viên chốt ở mục Bản dịch bên dưới)" : "Chưa có bản dịch tiếng Anh; dịch bằng AI ở mục Bản dịch bên dưới trước khi công khai" },
    { done: categoryPublished, label: `Danh mục ${category?.name_i18n.en || category?.slug || "chưa nhận diện"} đã đăng` },
    { done: supplier.status === "published", label: "NCC đã đăng (không tự chuyển trạng thái khi lưu)" },
    { done: commercialSupplier, label: "Hồ sơ NCC không phải dữ liệu thử nghiệm (tên, slug hoặc giới thiệu có TEST / DO NOT CONTACT; hồ sơ demo chỉ xem khi bật chế độ demo)" },
    { done: readiness.ready, label: "Có ít nhất một ảnh/catalogue của sản phẩm được chia sẻ buyer" },
    { done: productReviewApproved(product), label: "Vexim đã xác nhận nội dung và danh mục sản phẩm NCC" },
    { done: !!product.ready_for_buyer, label: "Đã bật “Sẵn sàng gửi buyer” và lưu hồ sơ" },
    { done: !isTestOnlyProduct(product.name), label: "Tên không bắt đầu bằng TEST ONLY" },
  ];
  // Supplier products show only missing requirements. Automatic media/review
  // changes are completed by the single publish action, not separate staff steps.
  const missingWebsiteChecks = websiteChecks.filter((item) => !item.done && !(needsPublicationAction && item.automatic));
  const shownWebsiteChecks = supplierReviewedListing ? missingWebsiteChecks : websiteChecks;
  const showLiveSummary = supplierReviewedListing && canView;
  const showWebsiteSection = supplierReviewedListing ? canView || missingWebsiteChecks.length > 0 : true;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Sản phẩm NCC", href: "/crm/products" },
              { label: product.name, href: `/crm/products/${product.id}` },
              { label: "Chỉnh sửa" },
            ]}
          />
        }
        title={`Sửa: ${product.name}`}
        sub={`Nhà cung cấp: ${supplier.name}`}
        actions={
          <DeleteProductButton productId={product.id} name={product.name} supplierId={supplier.id} />
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          {product.supplier_review_status && (product.supplier_review_status !== "approved" || needsPublicationRetry) && <section className="card border-amber-200 bg-amber-50 p-5 text-sm">
            <h2 className="font-bold text-ink-900">{needsPublicationAction ? "Duyệt và đăng" : product.supplier_review_status === "changes_requested" ? "Cần chỉnh sửa" : "Bản nháp"}</h2>
            <p className="mt-1 text-ink-700">{needsPublicationAction
              ? "Kiểm tra nội dung, danh mục và tệp. Một thao tác sẽ hoàn tất việc đăng sản phẩm."
              : "Sản phẩm chưa được đăng. NCC cần chỉnh sửa và gửi duyệt lại."}</p>
            {product.supplier_review_note && <p className="mt-2">Ghi chú: {product.supplier_review_note}</p>}
            {needsPublicationAction && (session.role === "admin" || session.role === "sourcing") &&
              <SupplierProductReviewControls
                id={product.id}
                proposal={product.supplier_category_proposal}
                reviewed={product.reviewed_category_slug}
                categories={categoryOptions}
                scope={supplierCategoryScope}
                inferredCategory={inferredCategory?.slug ?? null}
                allowChanges={product.supplier_review_status === "pending"}
              />}
          </section>}
          <ProductForm
            key={`${product.id}:${product.updated_at}`}
            supplier={supplier}
            product={product}
            categories={categories}
            supplierCategories={supplierCategories}
            mediaState={{ ready: readiness.ready, shareable: readiness.shareable }}
            savedPrice={{ buyerPrice: visiblePrice, blockers: priceBlockers, publicProduct: canView }}
          />
          <ProductTranslationPanel
            id={product.id}
            supplierProduct={supplierReviewedListing}
            source={{
              name: product.name ?? "",
              description: product.description ?? "",
              spec: product.spec ?? "",
              description_detail: product.description_detail ?? "",
              packaging: product.packaging ?? "",
              certifications: product.certifications ?? "",
            }}
            english={{
              name: product.name_i18n?.en ?? "",
              description: product.description_i18n?.en ?? "",
              spec: product.spec_i18n?.en ?? "",
              description_detail: product.description_detail_i18n?.en ?? "",
              packaging: product.packaging_i18n?.en ?? "",
              certifications: product.certifications_i18n?.en ?? "",
            }}
            hasEnglish={translationState.hasEnglish}
            current={translationState.current}
            translatedAt={translationState.translatedAt}
            origin={translationState.origin}
          />
          {!supplierReviewedListing && <ReadyHint ready={readiness.ready} shareable={readiness.shareable} />}
          <MediaManager
            ownerType="product"
            ownerId={product.id}
            supplierId={supplier.id}
            items={media}
            featuredMediaId={product.featured_media_id}
            note={supplierReviewedListing ? "Tệp của NCC sẽ được dùng khi đăng. Tài liệu nội bộ của staff vẫn riêng tư." : "Ảnh/catalogue chia sẻ buyer · giấy tờ nội bộ chỉ dùng trong nhà"}
          />
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6">
          {showWebsiteSection && <section className="card p-4" aria-label={supplierReviewedListing ? "Điều kiện đăng sản phẩm" : "Điều kiện xuất hiện trên website"}>
            <h2 className="mb-2 text-sm font-bold text-ink-900">{supplierReviewedListing ? (canView ? "Trạng thái đăng" : "Còn thiếu trước khi đăng") : "Điều kiện xuất hiện trên website"}</h2>
            {!supplierReviewedListing && <p className="mb-3 text-xs leading-relaxed text-ink-500">NCC chọn trong danh mục Vexim đã mở; Vexim kiểm tra từng sản phẩm trước khi đẩy lên sàn. Tệp NCC được duyệt sẽ chuyển sang chia sẻ buyer; tệp nội bộ của staff vẫn giữ riêng tư.</p>}
            {showLiveSummary
              ? <p className="flex items-start gap-2 text-[13px] text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />Sản phẩm đang hiển thị với buyer.</p>
              : <ul className="space-y-2.5">
                {shownWebsiteChecks.map((item) => (
                  <li key={item.label} className="flex items-start gap-2 text-[13px] leading-snug">
                    {item.done
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      : <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-400 text-amber-500"><Minus className="h-3 w-3" /></span>}
                    <span className={item.done ? "text-ink-700" : "font-medium text-ink-800"}>{item.label}</span>
                  </li>
                ))}
              </ul>}
            {(!supplierReviewedListing || canView) && readiness.ready && !productImages.length && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">{supplierReviewedListing ? "Sản phẩm chỉ có catalogue. Thêm ảnh để thẻ sản phẩm có hình." : "Catalogue đủ điều kiện gửi buyer nhưng thẻ chưa có ảnh: tải thêm ảnh sản phẩm chia sẻ buyer để không chỉ hiện biểu tượng trống."}</p>}
            {canView && category && <p className="mt-3 border-t border-ink-100 pt-3"><Link className="text-[13px] font-semibold text-brand-700 underline" href={`/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(product.id)}`} target="_blank">{supplierReviewedListing ? "Xem sản phẩm đã đăng" : "Xem trang sản phẩm công khai ↗"}</Link></p>}
          </section>}
          <section className="card p-4 text-[13px] leading-relaxed text-ink-600">
            <h2 className="mb-1 text-sm font-bold text-ink-900">Chứng nhận của NCC</h2>
            <p>Chứng nhận không lấy từ ô sản phẩm tự khai. <Link href={`/crm/suppliers/${supplier.id}/certificates`} className="font-semibold text-brand-700 underline">Xem chứng nhận NCC chờ kiểm và quyết định công bố →</Link></p>
          </section>
        </aside>
      </div>
    </>
  );
}
