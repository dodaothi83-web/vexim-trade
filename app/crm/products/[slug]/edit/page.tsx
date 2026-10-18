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
  const categoryOptions = allowedSupplierCategories(supplier, categoryProposalOptions(categories), linked);
  const categoryPublished = !!category && category.status === "published" && category.is_published;
  // Match the category catalog: a published test profile is still not a real commercial supplier.
  const commercialSupplier = !isSyntheticSupplier(supplier) ||
    (!!supplier.is_demo && process.env.VEXIM_SHOW_DEMO === "true");
  const canView = productReviewApproved(product) && supplier.status === "published" && categoryPublished &&
    commercialSupplier &&
    (supplier.is_demo ? process.env.VEXIM_SHOW_DEMO === "true" : product.ready_for_buyer && readiness.ready) &&
    !isTestOnlyProduct(product.name);
  const productImages = media.filter((m) => m.kind === "image" && m.audience === "buyer" && m.storage_path && !isExpired(m));
  const priceBlockers = productPriceBlockers(product, supplier);
  const visiblePrice = canView && !priceBlockers.length ? publicProductPrice(product, supplier) : null;

  const websiteChecks: Array<{ done: boolean; label: string }> = [
    { done: categoryPublished, label: `Danh mục ${category?.name_i18n.en || category?.slug || "chưa nhận diện"} đã đăng` },
    { done: supplier.status === "published", label: "NCC đã đăng (không tự chuyển trạng thái khi lưu)" },
    { done: commercialSupplier, label: "Hồ sơ NCC không phải dữ liệu thử nghiệm (tên, slug hoặc giới thiệu có TEST / DO NOT CONTACT; hồ sơ demo chỉ xem khi bật chế độ demo)" },
    { done: readiness.ready, label: "Có ít nhất một ảnh/catalogue của sản phẩm được chia sẻ buyer" },
    { done: productReviewApproved(product), label: "Vexim đã xác nhận nội dung và danh mục sản phẩm NCC" },
    { done: !!product.ready_for_buyer, label: "Đã bật “Sẵn sàng gửi buyer” và lưu hồ sơ" },
    { done: !isTestOnlyProduct(product.name), label: "Tên không bắt đầu bằng TEST ONLY" },
  ];

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
          {product.supplier_review_status && product.supplier_review_status !== "approved" && <section className="card border-amber-200 bg-amber-50 p-5 text-sm">
            <h2 className="font-bold text-ink-900">Sản phẩm NCC tự khai · {product.supplier_review_status === "pending" ? "Chờ Vexim kiểm tra" : product.supplier_review_status === "changes_requested" ? "Đã yêu cầu sửa" : "Bản nháp"}</h2>
            <p className="mt-1 text-ink-700">Không công khai sản phẩm hoặc tệp NCC tải lên cho đến khi Vexim xác nhận nội dung, chọn tệp chia sẻ buyer và bật sẵn sàng gửi buyer. Xác nhận sản phẩm không phải duyệt giấy tờ hay công khai NCC.</p>
            {product.supplier_review_note && <p className="mt-2">Ghi chú: {product.supplier_review_note}</p>}
            {product.supplier_review_status === "pending" && (session.role === "admin" || session.role === "sourcing") &&
              <SupplierProductReviewControls id={product.id} proposal={product.supplier_category_proposal} categories={categoryOptions} />}
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

        <aside className="space-y-4 xl:sticky xl:top-6">
          <section className="card p-4" aria-label="Điều kiện xuất hiện trên website">
            <h2 className="mb-1 text-sm font-bold text-ink-900">Điều kiện xuất hiện trên website</h2>
            <p className="mb-3 text-xs leading-relaxed text-ink-500">NCC chọn trong danh mục Vexim đã mở; Vexim kiểm tra từng sản phẩm trước khi cho công khai. Ảnh danh mục không phải ảnh sản phẩm: tải ảnh vào chính hồ sơ này và chọn “Chia sẻ buyer”.</p>
            <ul className="space-y-2.5">
              {websiteChecks.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-[13px] leading-snug">
                  {item.done
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    : <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-400 text-amber-500"><Minus className="h-3 w-3" /></span>}
                  <span className={item.done ? "text-ink-700" : "font-medium text-ink-800"}>{item.label}</span>
                </li>
              ))}
            </ul>
            {readiness.ready && !productImages.length && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">Catalogue đủ điều kiện gửi buyer nhưng thẻ chưa có ảnh: tải thêm ảnh sản phẩm chia sẻ buyer để không chỉ hiện biểu tượng trống.</p>}
            {canView && category && <p className="mt-3 border-t border-ink-100 pt-3"><Link className="text-[13px] font-semibold text-brand-700 underline" href={`/products/${encodeURIComponent(category.slug)}/${encodeURIComponent(product.id)}`} target="_blank">Xem trang sản phẩm công khai ↗</Link></p>}
          </section>
          <section className="card p-4 text-[13px] leading-relaxed text-ink-600">
            <h2 className="mb-1 text-sm font-bold text-ink-900">Chứng nhận của NCC</h2>
            <p>Chứng nhận không lấy từ ô sản phẩm tự khai. <Link href={`/crm/suppliers/${supplier.id}/certificates`} className="font-semibold text-brand-700 underline">Xem chứng nhận NCC chờ kiểm và quyết định công bố →</Link></p>
          </section>
        </aside>
      </div>
    </>
  );
}
