import { notFound } from "next/navigation";

import { getBuyerWithSupplier, listSalesOwnerNames } from "@/lib/queries";
import { hasPermission } from "@/lib/auth/permissions";
import { ownerScopeOf } from "@/lib/auth/scope";
import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { BuyerForm } from "@/components/buyer-form";
import { requirePagePermission } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function EditBuyerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePagePermission("buyers.manage", "/buyers");
  const buyer = await getBuyerWithSupplier(id, ownerScopeOf(session));
  if (!buyer) notFound();
  const [suppliers, owners] = await Promise.all([getStore().listSuppliers(), listSalesOwnerNames()]);

  return (
    <>
      <PageHeader
        title={`Sửa: ${buyer.company}`}
        sub="Lưu ý: đổi trạng thái ở đây KHÔNG gửi email. Hãy đổi trạng thái bằng dropdown ở trang chi tiết hoặc pipeline để hệ thống gửi thông báo."
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Buyer", href: "/buyers" },
              { label: buyer.company, href: `/buyers/${buyer.id}` },
              { label: "Sửa" },
            ]}
          />
        }
      />
      <div className="max-w-5xl">
        <BuyerForm
          buyer={buyer}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, status: s.status }))}
          owners={owners}
          canReassign={hasPermission(session.role, "users.manage")}
        />
      </div>
    </>
  );
}
