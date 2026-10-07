import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
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
        title={`Sửa: ${supplier.name}`}
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Nhà cung cấp", href: "/suppliers" },
              { label: supplier.name, href: `/suppliers/${supplier.id}` },
              { label: "Sửa" },
            ]}
          />
        }
      />
      <div className="max-w-5xl">
        <SupplierForm supplier={supplier} />
      </div>
    </>
  );
}
