import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { SupplierForm } from "@/components/supplier-form";
import { getStore } from "@/lib/db";
import { requirePagePermission } from "@/lib/auth/session";

export const metadata = { title: "Thêm nhà cung cấp" };

export default async function NewSupplierPage() {
  await requirePagePermission("suppliers.manage", "/crm/suppliers");
  const store = getStore();
  const [categories, suppliers] = await Promise.all([
    store.listCategories({ publishedOnly: false }),
    // Chỉ lấy các trường cần để cảnh báo tạo trùng ngay khi gõ tên.
    store.listSuppliers().catch(() => []),
  ]);
  const existingSuppliers = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    trade_name: s.trade_name,
    display_name: s.display_name ?? null,
    tax_id: s.tax_id,
    website: s.website,
    province: s.province,
  }));
  return (
    <>
      <PageHeader
        title="Thêm nhà cung cấp"
        sub="Tạo hồ sơ trong 1 phút — chỉ cần tên nhà cung cấp. Các thông tin còn lại bổ sung sau ở trang Sửa."
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Nhà cung cấp", href: "/crm/suppliers" }, { label: "Thêm mới" }]} />
        }
      />
      <SupplierForm mode="create" categories={categories} existingSuppliers={existingSuppliers} aiEnabled={!!process.env.OPENAI_API_KEY} />
    </>
  );
}
