import { notFound } from "next/navigation";

import { getBuyerWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { Breadcrumbs } from "@/components/ui";
import { PageHeader } from "@/components/page-header";
import { BuyerForm } from "@/components/buyer-form";

export const dynamic = "force-dynamic";

export default async function EditBuyerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const buyer = await getBuyerWithSupplier(id);
  if (!buyer) notFound();
  const suppliers = await getStore().listSuppliers();

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
        />
      </div>
    </>
  );
}
