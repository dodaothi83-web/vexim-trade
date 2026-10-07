import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Thêm sản phẩm" };

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = await getStore().getSupplier(id);
  if (!supplier) notFound();

  return (
    <>
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Nhà cung cấp", href: "/suppliers" },
              { label: supplier.name, href: `/suppliers/${supplier.id}` },
              { label: "Thêm sản phẩm" },
            ]}
          />
        }
        title="Thêm hồ sơ sản phẩm"
        sub="Một hồ sơ cho mỗi dòng sản phẩm / quy cách để dễ so khớp với RFQ của buyer."
      />
      <div className="mx-auto max-w-4xl">
        <ProductForm supplier={supplier} />
      </div>
    </>
  );
}
