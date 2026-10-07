import Link from "next/link";
import { KanbanSquare, UserPlus } from "lucide-react";

import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { BuyerTable } from "@/components/buyer-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Buyer" };

export default async function BuyersPage() {
  const [buyers, suppliers] = await Promise.all([
    listBuyersWithSupplier(),
    getStore().listSuppliers(),
  ]);

  return (
    <>
      <PageHeader
        title="Buyer"
        sub={`${buyers.length} khách hàng · đổi trạng thái ngay trên dòng để gửi email cập nhật cho buyer và nhà cung cấp`}
        actions={
          <>
            <Link href="/pipeline" className="btn btn-ghost">
              <KanbanSquare className="h-4 w-4" />
              Xem pipeline
            </Link>
            <Link href="/buyers/new" className="btn btn-primary">
              <UserPlus className="h-4 w-4" />
              Thêm buyer
            </Link>
          </>
        }
      />
      <BuyerTable
        buyers={buyers}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      />
    </>
  );
}
