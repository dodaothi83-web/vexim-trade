import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";
import { MediaManager } from "@/components/media-manager";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = getStore();
  const supplier = await store.getSupplier(id);
  if (!supplier) notFound();
  const media = await store.listMedia("supplier", id);

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
      <div className="max-w-5xl space-y-5">
        <SupplierForm supplier={supplier} />
        <MediaManager
          ownerType="supplier"
          ownerId={id}
          items={media}
          note="Ảnh nhà máy có thể chia sẻ buyer · giấy tờ xác minh để chế độ Nội bộ"
        />
      </div>
    </>
  );
}
