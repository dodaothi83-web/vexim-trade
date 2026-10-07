import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { getStage } from "@/lib/pipeline";
import { PageHeader } from "@/components/page-header";
import { SupplierTable } from "@/components/supplier-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nhà cung cấp" };

export default async function SuppliersPage() {
  const [suppliers, buyers] = await Promise.all([
    getStore().listSuppliers(),
    listBuyersWithSupplier(),
  ]);

  const usage: Record<string, { total: number; active: number }> = {};
  for (const b of buyers) {
    if (!b.supplier_id) continue;
    usage[b.supplier_id] ??= { total: 0, active: 0 };
    usage[b.supplier_id].total += 1;
    if (!getStage(b.stage).terminal) usage[b.supplier_id].active += 1;
  }

  return (
    <>
      <PageHeader
        title="Nhà cung cấp"
        sub={`${suppliers.length} xưởng / nhà cung cấp · gắn vào đơn để nhận email cập nhật tiến độ bằng tiếng Việt`}
      />
      <SupplierTable suppliers={suppliers} usage={usage} />
    </>
  );
}
