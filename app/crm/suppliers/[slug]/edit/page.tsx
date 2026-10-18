import Link from "next/link";
import { notFound } from "next/navigation";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";
import { MediaManager } from "@/components/media-manager";
import { SupplierImagePicker } from "@/components/supplier-image-picker";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: id } = await params;
  const session = await requirePagePermission("suppliers.manage", "/crm/suppliers");
  const store = getStore();
  const supplier = await store.getSupplier(id);
  if (!supplier) notFound();
  const [media, products, categories] = await Promise.all([
    store.listMedia("supplier", id), store.listProductsBySupplier(id), store.listCategories({ publishedOnly: false }),
  ]);

  return (
    <>
      <PageHeader
        title={supplier.display_name || supplier.name}
        sub="Chỉnh sửa hồ sơ nhà cung cấp"
        breadcrumbs={<Breadcrumbs items={[
          { label: "Nhà cung cấp", href: "/crm/suppliers" },
          { label: supplier.name, href: `/crm/suppliers/${supplier.id}` },
          { label: "Chỉnh sửa" },
        ]} />}
      />
      <div className="max-w-5xl space-y-5">
        <SupplierForm supplier={supplier} products={products} categories={categories} canPublish={hasPermission(session.role, "suppliers.publish")} aiEnabled={!!process.env.OPENAI_API_KEY} />
        <details className="card p-5">
          <summary className="cursor-pointer text-base font-bold text-ink-900">Ảnh đại diện & ảnh bìa</summary>
          <div className="mt-4 grid gap-4 md:grid-cols-[200px_1fr]">
            <SupplierImagePicker supplierId={id} kind="profile" current={supplier.profile_image ?? null} label="Ảnh đại diện" hint="Chưa có ảnh" />
            <SupplierImagePicker supplierId={id} kind="cover" current={supplier.cover_image ?? null} label="Ảnh bìa" hint="Chưa có ảnh bìa" ratioClass="aspect-[3/1] w-full" />
          </div>
        </details>
        <details className="card p-5">
          <summary className="cursor-pointer text-base font-bold text-ink-900">Kho ảnh & tài liệu chung của NCC</summary>
          <div className="mt-4"><MediaManager ownerType="supplier" ownerId={id} items={media}
            scopeHint="Tệp ở đây thuộc hồ sơ chung, không được dùng làm bằng chứng hoặc gửi AI trong các bước kiểm. Muốn kiểm giấy tờ, hãy đính kèm tại trang Kiểm tra giấy tờ."
            note="Ảnh chia sẻ buyer hoặc tài liệu nội bộ" /></div>
          {hasPermission(session.role, "verifications.inspect") && <Link href={`/crm/suppliers/${id}/audit/documents`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">Mở bước Kiểm tra giấy tờ để đính kèm bằng chứng →</Link>}
        </details>
      </div>
    </>
  );
}
