import Link from "next/link";
import { KanbanSquare, UserPlus } from "lucide-react";

import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { ownerScopeOf } from "@/lib/auth/scope";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { BuyerTable } from "@/components/buyer-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Buyer" };

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const session = await requireSession();
  const { owner: ownerFilter } = await searchParams;
  const canManage = hasPermission(session.role, "buyers.manage");

  const [buyers, suppliers] = await Promise.all([
    listBuyersWithSupplier(ownerScopeOf(session)),
    getStore().listSuppliers(),
  ]);
  // Chỉ quản trị viên thấy buyer chưa có người phụ trách (nhân viên sale đã bị giới hạn theo phạm vi)
  const unassignedCount = buyers.filter((b) => !(b.owner ?? "").trim()).length;
  const shownBuyers = ownerFilter === "unassigned" ? buyers.filter((b) => !(b.owner ?? "").trim()) : buyers;

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
            {canManage && (
              <Link href="/buyers/new" className="btn btn-primary">
                <UserPlus className="h-4 w-4" />
                Thêm buyer
              </Link>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
        <Link href="/buyers" className={ownerFilter === "unassigned" ? "btn btn-ghost" : "btn btn-primary"}>
          Tất cả
        </Link>
        {unassignedCount > 0 && (
          <Link
            href="/buyers?owner=unassigned"
            className={ownerFilter === "unassigned" ? "btn btn-primary" : "btn btn-ghost"}
          >
            Chưa phân công ({unassignedCount})
          </Link>
        )}
      </div>
      <BuyerTable
        buyers={shownBuyers}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        canManage={canManage}
      />
    </>
  );
}
