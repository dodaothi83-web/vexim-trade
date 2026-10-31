import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderOpen, Images } from "lucide-react";

import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";
import { MediaManager } from "@/components/media-manager";
import { SupplierImagePicker } from "@/components/supplier-image-picker";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

function SectionHead({ icon: Icon, title, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span>
        <h2 className="text-base font-bold leading-6 text-ink-900">{title}</h2>
        {sub && <p className="mt-0.5 text-[13px] leading-5 text-ink-500">{sub}</p>}
      </span>
    </div>
  );
}

export default async function EditSupplierPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: id } = await params;
  const session = await requirePagePermission("suppliers.manage", "/crm/suppliers");
  const store = getStore();
  const supplier = await store.getSupplier(id);
  if (!supplier) notFound();
  const [media, products, categories] = await Promise.all([
    store.listMedia("supplier", id), store.listProductsBySupplier(id), store.listCategories({ publishedOnly: false }),
  ]);
  const canInspect = hasPermission(session.role, "verifications.inspect");

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
      <SupplierForm supplier={supplier} products={products} categories={categories} aiEnabled={!!process.env.OPENAI_API_KEY} />

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
        <section className="card p-5">
          <SectionHead icon={Images} title="Ảnh đại diện và ảnh bìa" sub="Ảnh hiển thị trên trang nhà cung cấp khi hồ sơ được công khai." />
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <SupplierImagePicker supplierId={id} kind="profile" current={supplier.profile_image ?? null} label="Ảnh đại diện" hint="Chưa có ảnh" />
            <SupplierImagePicker supplierId={id} kind="cover" current={supplier.cover_image ?? null} label="Ảnh bìa" hint="Chưa có ảnh bìa" ratioClass="aspect-[3/1] w-full" />
          </div>
        </section>

        <section className="card p-5">
          <SectionHead icon={FolderOpen} title="Kho ảnh và tài liệu chung" sub="Tệp thuộc hồ sơ chung của nhà cung cấp." />
          <MediaManager ownerType="supplier" ownerId={id} items={media}
            scopeHint="Tệp ở đây thuộc hồ sơ chung, không dùng làm bằng chứng khi kiểm. Muốn kiểm giấy tờ, đính kèm tại trang Kiểm tra giấy tờ."
            note="Ảnh chia sẻ người mua hoặc tài liệu nội bộ" />
          {canInspect && <Link href={`/crm/suppliers/${id}/audit/documents`} className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">Mở bước Kiểm tra giấy tờ để đính kèm bằng chứng →</Link>}
        </section>
      </div>
    </>
  );
}
