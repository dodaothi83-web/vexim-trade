import { notFound } from "next/navigation";
import Link from "next/link";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { assignProductCategory, assignSupplierCategories } from "@/lib/public/category-assignment";
import { isTestOnlyProduct, productReviewApproved, productPriceBlockers, publicProductPrice } from "@/lib/public/product-selection";
import { DeleteProductButton } from "@/components/product-actions";
import { MediaManager, ReadyHint } from "@/components/media-manager";
import { isExpired, productReadiness } from "@/lib/media/readiness";
import { requirePagePermission } from "@/lib/auth/session";
import { SupplierProductReviewControls } from "./review-controls";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";

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
  const categoryOptions = categoryProposalOptions(categories);
  const categoryPublished = !!category && category.status === "published" && category.is_published;
  const canView = productReviewApproved(product) && supplier.status === "published" && categoryPublished &&
    (supplier.is_demo ? process.env.VEXIM_SHOW_DEMO === "true" : product.ready_for_buyer && readiness.ready) &&
    !isTestOnlyProduct(product.name);
  const productImages = media.filter((m) => m.kind === "image" && m.audience === "buyer" && m.storage_path && !isExpired(m));
  const priceBlockers = productPriceBlockers(product, supplier);
  const visiblePrice = canView && !priceBlockers.length ? publicProductPrice(product, supplier) : null;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Nhà cung cấp", href: "/crm/suppliers" },
              { label: supplier.name, href: `/crm/suppliers/${supplier.id}` },
              { label: product.name },
            ]}
          />
        }
        title={`Sửa: ${product.name}`}
        sub={`Nhà cung cấp: ${supplier.name}`}
        actions={
          <DeleteProductButton productId={product.id} name={product.name} supplierId={supplier.id} />
        }
      />
      <div className="mx-auto max-w-4xl space-y-5">
        {product.supplier_review_status && product.supplier_review_status !== "approved" && <section className="card border-amber-200 bg-amber-50 p-5 text-sm">
          <h2 className="font-bold text-ink-900">Sản phẩm NCC tự khai · {product.supplier_review_status === "pending" ? "Chờ Vexim kiểm tra" : product.supplier_review_status === "changes_requested" ? "Đã yêu cầu sửa" : "Bản nháp"}</h2>
          <p className="mt-1 text-ink-700">Không công khai sản phẩm hoặc tệp NCC tải lên cho đến khi Vexim xác nhận nội dung, chọn tệp chia sẻ buyer và bật sẵn sàng gửi buyer. Xác nhận sản phẩm không phải duyệt giấy tờ hay công khai NCC.</p>
          {product.supplier_review_note && <p className="mt-2">Ghi chú: {product.supplier_review_note}</p>}
          {product.supplier_review_status === "pending" && (session.role === "admin" || session.role === "sourcing") &&
            <SupplierProductReviewControls id={product.id} proposal={product.supplier_category_proposal} categories={categoryOptions} />}
        </section>}
        {product.supplier_review_status === "approved" && (session.role === "admin" || session.role === "sourcing") &&
          <section className="card p-5"><h2 className="font-bold text-ink-900">Danh mục Vexim xác nhận</h2>
            <SupplierProductReviewControls id={product.id} proposal={product.supplier_category_proposal}
              reviewed={product.reviewed_category_slug} categories={categoryOptions} approved /></section>}
        <section className="card p-5 text-sm" aria-label="Điều kiện xuất hiện trên website">
          <h2 className="font-bold text-ink-900">Hiển thị sản phẩm trên website</h2>
          <p className="mt-1 text-ink-600">Danh mục Vexim đã chốt quyết định trang sản phẩm; với sản phẩm cũ chưa có quyết định, hệ thống vẫn gợi ý theo nội dung. Ảnh danh mục không phải ảnh sản phẩm: tải ảnh vào chính hồ sơ này và chọn “Chia sẻ buyer”.</p>
          <ul className="mt-3 space-y-1 text-ink-700">
            <li>{categoryPublished ? "✓" : "○"} Danh mục {category?.name_i18n.en || category?.slug || "chưa nhận diện"} đã đăng</li>
            <li>{supplier.status === "published" ? "✓" : "○"} NCC đã đăng (không tự chuyển trạng thái khi lưu)</li>
            <li>{readiness.ready ? "✓" : "○"} Có ít nhất một ảnh/catalogue của sản phẩm được chia sẻ buyer</li>
            <li>{productReviewApproved(product) ? "✓" : "○"} Vexim đã xác nhận nội dung và danh mục sản phẩm NCC</li>
            <li>{product.ready_for_buyer ? "✓" : "○"} Đã bật “Sẵn sàng gửi buyer” và lưu hồ sơ</li>
            <li>{!isTestOnlyProduct(product.name) ? "✓" : "○"} Tên không bắt đầu bằng TEST ONLY</li>
          </ul>
          {readiness.ready && !productImages.length && <p className="mt-2 text-amber-800">Catalogue đủ điều kiện gửi buyer nhưng thẻ chưa có ảnh: tải thêm ảnh sản phẩm chia sẻ buyer để không chỉ hiện biểu tượng trống.</p>}
          {canView && category && <p className="mt-3"><Link className="font-semibold text-brand-700 underline" href={`/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(product.id)}`} target="_blank">Xem trang sản phẩm công khai ↗</Link></p>}
        </section>
        <section className="card p-5 text-sm" aria-label="Tình trạng giá tham khảo đã lưu">
          <h2 className="font-bold text-ink-900">Giá trên trang buyer · trạng thái đã lưu</h2>
          <p className="mt-1 text-ink-600">Tích công khai giá trong form bên dưới chỉ là cho phép theo sản phẩm. Sau khi tích cần <strong>Lưu thay đổi</strong>; NCC còn phải đồng ý chia sẻ giá trong 180 ngày. Không tự tạo sự đồng ý của NCC khi nhân viên tích vào sản phẩm.</p>
          {visiblePrice ? <p className="mt-3 rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900">✓ Đủ điều kiện hiển thị: {visiblePrice}</p>
            : <div className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950" role="status">
              <p className="font-semibold">Buyer hiện thấy “On request”{!canView ? " hoặc chưa truy cập được trang sản phẩm" : ""} vì:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">{priceBlockers.map((reason) => <li key={reason}>{reason}</li>)}
                {!canView && <li>Sản phẩm chưa đáp ứng đủ điều kiện công bố ở checklist phía trên (duyệt, danh mục, NCC, ảnh/catalogue hoặc buyer-ready).</li>}
              </ul>
              {priceBlockers.some((reason) => reason.includes("NCC")) && <Link href={`/crm/suppliers/${supplier.id}/edit#price-sharing`} className="mt-2 inline-block font-semibold text-brand-700 underline">Mở hồ sơ NCC để kiểm tra quyền chia sẻ giá →</Link>}
            </div>}
        </section>
        <p className="text-sm text-ink-600">Chứng nhận không lấy từ ô sản phẩm tự khai. <Link href={`/crm/suppliers/${supplier.id}/certificates`} className="font-semibold text-brand-700 underline">Xem chứng nhận NCC chờ kiểm và quyết định công bố →</Link></p>
        <ProductForm
          key={`${product.id}:${product.updated_at}`}
          supplier={supplier}
          product={product}
          categories={categories}
          supplierCategories={supplierCategories}
          mediaState={{ ready: readiness.ready, shareable: readiness.shareable }}
        />
        <ReadyHint ready={readiness.ready} shareable={readiness.shareable} />
        <MediaManager
          ownerType="product"
          ownerId={product.id}
          supplierId={supplier.id}
          items={media}
          featuredMediaId={product.featured_media_id}
          note="Ảnh/catalogue chia sẻ buyer · giấy tờ nội bộ chỉ dùng trong nhà"
        />
      </div>
    </>
  );
}
