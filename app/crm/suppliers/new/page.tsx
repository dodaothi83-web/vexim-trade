import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";
import { requirePagePermission } from "@/lib/auth/session";

export const metadata = { title: "Thêm nhà cung cấp" };

export default async function NewSupplierPage() {
  await requirePagePermission("suppliers.manage", "/crm/suppliers");
  return (
    <>
      <PageHeader
        title="Thêm nhà cung cấp"
        sub="Chỉ cần tên để lưu hồ sơ. Thông tin liên hệ và mặt hàng có thể bổ sung sau."
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Nhà cung cấp", href: "/crm/suppliers" }, { label: "Thêm mới" }]} />
        }
      />
      <div className="max-w-5xl">
        <SupplierForm aiEnabled={!!process.env.OPENAI_API_KEY} />
      </div>
    </>
  );
}
