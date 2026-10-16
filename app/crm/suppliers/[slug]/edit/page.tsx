import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { Breadcrumbs, Card } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";
import { MediaManager } from "@/components/media-manager";
import { SupplierImagePicker } from "@/components/supplier-image-picker";
import { requirePagePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: id } = await params;
  await requirePagePermission("suppliers.manage", "/crm/suppliers");
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
              { label: "Nhà cung cấp", href: "/crm/suppliers" },
              { label: supplier.name, href: `/crm/suppliers/${supplier.id}` },
              { label: "Sửa" },
            ]}
          />
        }
      />
      <div className="max-w-5xl space-y-5">
        <Card>
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-[15px] font-bold text-ink-900">Ảnh công khai</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Ảnh đại diện và bìa hiển thị trên trang giới thiệu nhà cung cấp và danh mục công khai.
              Khuyến nghị bìa 1600×533 JPEG, đại diện 800×800 JPEG, dung lượng &lt; 300 KB.
            </p>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-[200px_1fr]">
            <SupplierImagePicker
              supplierId={id}
              kind="profile"
              current={supplier.profile_image ?? null}
              label="Ảnh đại diện (logo / ảnh nhà máy)"
              hint="Chưa có ảnh"
            />
            <SupplierImagePicker
              supplierId={id}
              kind="cover"
              current={supplier.cover_image ?? null}
              label="Ảnh bìa"
              hint="Chưa có ảnh bìa"
              ratioClass="aspect-[3/1] w-full"
            />
          </div>
        </Card>

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
