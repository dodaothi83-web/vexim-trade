import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { BuyerForm } from "@/components/buyer-form";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { listSalesOwnerNames } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Thêm buyer" };

export default async function NewBuyerPage() {
  const session = await requirePagePermission("buyers.manage", "/buyers");
  const [suppliers, owners] = await Promise.all([getStore().listSuppliers(), listSalesOwnerNames()]);
  return (
    <>
      <PageHeader
        title="Thêm buyer mới"
        sub="Nhập thông tin khách hàng nước ngoài. Sau khi tạo, bạn có thể đổi trạng thái để hệ thống gửi email tự động."
        breadcrumbs={<Breadcrumbs items={[{ label: "Buyer", href: "/buyers" }, { label: "Thêm mới" }]} />}
      />
      <div className="max-w-5xl">
        <BuyerForm
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, status: s.status }))}
          owners={owners}
          canReassign={hasPermission(session.role, "users.manage")}
        />
      </div>
    </>
  );
}
