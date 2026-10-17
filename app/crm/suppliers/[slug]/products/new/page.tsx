import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";
import { assignSupplierCategories } from "@/lib/public/category-assignment";
import { requirePagePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Thêm sản phẩm" };

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: id } = await params;
  await requirePagePermission("products.manage", "/crm/suppliers");
  const store = getStore();
  const [supplier, categories] = await Promise.all([store.getSupplier(id), store.listCategories({ publishedOnly: false })]);
  if (!supplier) notFound();
  const links = await store.listSupplierCategories(id).catch(() => []);
  const supplierCategories = links.length
    ? links.map((link) => categories.find((c) => c.id === link.category_id)?.slug).filter((slug): slug is string => !!slug)
    : assignSupplierCategories(supplier.products, [], categories).slugs;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Nhà cung cấp", href: "/crm/suppliers" },
              { label: supplier.name, href: `/crm/suppliers/${supplier.id}` },
              { label: "Thêm sản phẩm" },
            ]}
          />
        }
        title="Thêm hồ sơ sản phẩm"
        sub="Một hồ sơ cho mỗi dòng sản phẩm / quy cách để dễ so khớp với RFQ của buyer."
      />
      <div className="mx-auto max-w-4xl">
        <ProductForm supplier={supplier} categories={categories} supplierCategories={supplierCategories} />
      </div>
    </>
  );
}
