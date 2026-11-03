import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { buildSupplierOrderUsage, buildSupplierReviewTimes } from "@/lib/crm/supplier-list";
import { requireSession } from "@/lib/auth/session";
import { ownerScopeOf } from "@/lib/auth/scope";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { SupplierTable } from "@/components/supplier-table";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { groupPendingCategoryRequests } from "@/lib/supplier-portal/requested-category";
import { IndustryRequests } from "./industry-requests";

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

  // Ngành NCC đề nghị mở: gom theo ngành + đếm số NCC. Thiếu migration thì chỉ mất khối này,
  // danh sách nhà cung cấp bên dưới vẫn dùng bình thường.
  const [categoryRows, publishedCategories] = await Promise.all([
    store.listPendingSupplierCategoryRequests().catch((error) => {
      console.error("[crm-suppliers] cannot load industry requests", error);
      return [];
    }),
    canManage ? store.listCategories({ publishedOnly: true }).catch(() => []) : Promise.resolve([]),
  ]);
  const industryGroups = canManage ? groupPendingCategoryRequests(categoryRows, publishedCategories) : [];
  const supplierNames = Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const categoryOptions = categoryProposalOptions(publishedCategories).map((option) => ({ slug: option.slug, label: option.label }));

  return (
    <>
      <PageHeader
        title="Nhà cung cấp"
        sub={`${suppliers.length} xưởng / nhà cung cấp · gắn vào đơn để nhận email cập nhật tiến độ bằng tiếng Việt`}
      />
      {canManage && <section id="industries" className="mb-6 scroll-mt-24">
        <h2 className="text-sm font-black uppercase tracking-wide text-ink-700">Ngành nhà cung cấp đề nghị mở</h2>
        <p className="mt-1 mb-3 text-xs text-ink-500">
          Cam kết với nhà cung cấp: xem xét trong 3 ngày làm việc và trả lời qua email. Hồ sơ doanh nghiệp của họ vẫn được duyệt;
          sản phẩm chỉ đăng được khi danh mục đã mở.
        </p>
        <IndustryRequests groups={industryGroups} supplierNames={supplierNames} options={categoryOptions} />
      </section>}
      <SupplierTable suppliers={suppliers} usage={usage} reviewedAt={reviewedAt} canManage={canManage} />
    </>
  );
}
