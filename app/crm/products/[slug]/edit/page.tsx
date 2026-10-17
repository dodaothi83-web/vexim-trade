import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { DeleteProductButton } from "@/components/product-actions";
import { MediaManager, ReadyHint } from "@/components/media-manager";
import { productReadiness } from "@/lib/media/readiness";
import { requirePagePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sửa hồ sơ sản phẩm" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: id } = await params;
  await requirePagePermission("products.manage", "/crm/products");
  const store = getStore();
  const product = await store.getProduct(id);
  if (!product) notFound();
  const supplier = await store.getSupplier(product.supplier_id);
  if (!supplier) notFound();
  const [media, categories] = await Promise.all([store.listMedia("product", id), store.listCategories({ publishedOnly: false })]);
  const readiness = productReadiness(media);

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
        <ProductForm
          supplier={supplier}
          product={product}
          categories={categories}
          mediaState={{ ready: readiness.ready, shareable: readiness.shareable }}
        />
        <ReadyHint ready={readiness.ready} shareable={readiness.shareable} />
        <MediaManager
          ownerType="product"
          ownerId={product.id}
          supplierId={supplier.id}
          items={media}
          note="Ảnh/catalogue chia sẻ buyer · giấy tờ nội bộ chỉ dùng trong nhà"
        />
      </div>
    </>
  );
}
