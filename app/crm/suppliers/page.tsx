import { listBuyersWithSupplier } from "@/lib/queries";
import { getStore } from "@/lib/db";
import { buildSupplierOrderUsage, buildSupplierReviewTimes } from "@/lib/crm/supplier-list";
import { requirePagePermission } from "@/lib/auth/session";
import { ownerScopeOf } from "@/lib/auth/scope";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/page-header";
import { SupplierTable } from "@/components/supplier-table";
import { categoryProposalOptions } from "@/lib/supplier-portal/category-proposals";
import { groupPendingCategoryRequests } from "@/lib/supplier-portal/requested-category";
import { isRenewalNote, requestedPlanOf } from "@/lib/supplier-services";
import { IndustryRequests } from "./industry-requests";
import { filterOwnedSuppliers, isSupplierScopedRole } from "@/lib/auth/supplier-scope";
import { isUnassigned, ownerCandidates } from "@/lib/crm/supplier-owner-rules";
import { DistributeSuppliersButton } from "./owner-controls";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nhà cung cấp" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: initialPlanFilter } = await searchParams;
  const session = await requirePagePermission("suppliers.view", "/crm/dashboard");
  const canManage = hasPermission(session.role, "suppliers.manage");

  const store = getStore();
  const scoped = isSupplierScopedRole(session.role);
  const [allSuppliers, buyers, reviewDecisions, serviceRequests, users] = await Promise.all([
    store.listSuppliers(),
    hasPermission(session.role, "buyers.view") ? listBuyersWithSupplier(ownerScopeOf(session)) : Promise.resolve([]),
    store.listSupplierOnboardingDecisions().catch((error) => {
      console.error("[crm-suppliers] cannot load onboarding review times", error);
      return [];
    }),
    store.listSupplierServiceRequests({ limit: 500 }).catch((error) => {
      console.error("[crm-suppliers] cannot load plan upgrade requests", error);
      return [];
    }),
    store.listUsers().catch((error) => {
      console.error("[crm-suppliers] cannot load staff", error);
      return [];
    }),
  ]);
  // Kinh doanh chỉ thấy nhà cung cấp mình phụ trách; các vai trò khác thấy tất cả và lọc theo người phụ trách.
  const suppliers = filterOwnedSuppliers(session, allSuppliers);
  const staff = ownerCandidates(users).map((u) => ({ id: u.id, name: u.name?.trim() || u.email }));
  const ownerNames = Object.fromEntries(users.map((u) => [u.id, u.name?.trim() || u.email]));
  const staffIds = new Set(staff.map((s) => s.id));
  const unassigned = suppliers.filter((s) => isUnassigned(s, staffIds) && !s.is_demo).length;
  const canAssign = hasPermission(session.role, "suppliers.assign");

  // Yêu cầu nâng gói còn mở (chưa đóng) theo nhà cung cấp, để bảng gắn nhãn "Xin nâng …".
  const upgradeRequests: Record<string, { plan: "premium" | "pro" | null; renewal: boolean; status: string; createdAt: string }> = {};
  for (const r of serviceRequests) {
    if (r.service_key !== "plan_upgrade" || r.status !== "submitted" || upgradeRequests[r.supplier_id]) continue;
    upgradeRequests[r.supplier_id] = { plan: requestedPlanOf(r.note), renewal: isRenewalNote(r.note), status: r.status, createdAt: r.created_at };
  }

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
  const industryGroups = canManage && !scoped ? groupPendingCategoryRequests(categoryRows, publishedCategories) : [];
  const supplierNames = Object.fromEntries(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const categoryOptions = categoryProposalOptions(publishedCategories).map((option) => ({ slug: option.slug, label: option.label }));

  return (
    <>
      <PageHeader
        title="Nhà cung cấp"
        sub={scoped
          ? `${suppliers.length} nhà cung cấp bạn phụ trách`
          : `${suppliers.length} xưởng / nhà cung cấp · gắn vào đơn để nhận email cập nhật tiến độ bằng tiếng Việt`}
      />
      {canManage && industryGroups.length > 0 && <details id="industries" className="group mb-4 scroll-mt-24 rounded-xl border border-ink-200 bg-white" open={industryGroups.length <= 2}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
          <span className="text-[13.5px] font-bold text-ink-900">Ngành nhà cung cấp đề nghị mở</span>
          <span className="rounded-full bg-amber-100 px-2 text-[11.5px] font-bold text-amber-800">
            {industryGroups.length}
          </span>
          <span className="text-[12px] text-ink-500">Trả lời trong 3 ngày làm việc qua email.</span>
          <span className="ml-auto text-[12px] font-semibold text-brand-700 group-open:hidden">Xem</span>
          <span className="ml-auto hidden text-[12px] font-semibold text-brand-700 group-open:inline">Thu gọn</span>
        </summary>
        <div className="border-t border-ink-100 p-4">
          <p className="mb-3 text-xs text-ink-500">
            Hồ sơ doanh nghiệp vẫn được duyệt; sản phẩm chỉ đăng được khi danh mục đã mở.
          </p>
          <IndustryRequests groups={industryGroups} supplierNames={supplierNames} options={categoryOptions} />
        </div>
      </details>}
      <SupplierTable key={initialPlanFilter ?? "all"} suppliers={suppliers} usage={usage} reviewedAt={reviewedAt} canManage={canManage}
        upgradeRequests={upgradeRequests} initialPlanFilter={initialPlanFilter}
        owners={scoped ? undefined : staff} ownerNames={scoped ? {} : ownerNames}
        distributeSlot={canAssign ? <DistributeSuppliersButton unassigned={unassigned} staffCount={staff.length} /> : null} />
    </>
  );
}
