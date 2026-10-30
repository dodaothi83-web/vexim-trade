import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { buildSupplierOrderUsage, buildSupplierReviewTimes } from "@/lib/crm/supplier-list";
import { requireSession } from "@/lib/auth/session";
import { ownerScopeOf } from "@/lib/auth/scope";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { SupplierTable } from "@/components/supplier-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nhà cung cấp" };

export default async function SuppliersPage() {
  const session = await requireSession();
  const canManage = hasPermission(session.role, "suppliers.manage");

  const store = getStore();
  const [suppliers, buyers, reviewDecisions] = await Promise.all([
    store.listSuppliers(),
    hasPermission(session.role, "buyers.view") ? listBuyersWithSupplier(ownerScopeOf(session)) : Promise.resolve([]),
    store.listSupplierOnboardingDecisions().catch((error) => {
      console.error("[crm-suppliers] cannot load onboarding review times", error);
      return [];
    }),
  ]);

  const usage = buildSupplierOrderUsage(buyers);
  const reviewedAt = buildSupplierReviewTimes(suppliers, reviewDecisions);

  return (
    <>
      <PageHeader
        title="Nhà cung cấp"
        sub={`${suppliers.length} xưởng / nhà cung cấp · gắn vào đơn để nhận email cập nhật tiến độ bằng tiếng Việt`}
      />
      <SupplierTable suppliers={suppliers} usage={usage} reviewedAt={reviewedAt} canManage={canManage} />
    </>
  );
}
