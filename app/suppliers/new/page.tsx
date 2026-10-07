import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";

export const metadata = { title: "Thêm nhà cung cấp" };

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader
        title="Thêm nhà cung cấp"
        sub="Thông tin xưởng / nhà cung cấp trong nước. Email là bắt buộc để nhận thông báo đơn hàng."
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Nhà cung cấp", href: "/suppliers" }, { label: "Thêm mới" }]} />
        }
      />
      <div className="max-w-5xl">
        <SupplierForm />
      </div>
    </>
  );
}
