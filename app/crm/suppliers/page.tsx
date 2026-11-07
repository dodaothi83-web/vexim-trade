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
  const [suppliers, buyers, reviewDecisions, users] = await Promise.all([
    store.listSuppliers(),
    hasPermission(session.role, "buyers.view") ? listBuyersWithSupplier(ownerScopeOf(session)) : Promise.resolve([]),
    store.listSupplierOnboardingDecisions().catch((error) => {
      console.error("[crm-suppliers] cannot load onboarding review times", error);
      return [];
    }),
    store.listUsers().catch((error) => {
      console.error("[crm-suppliers] cannot load supplier logins", error);
      return [];
    }),
  ]);
  // Tài khoản đăng nhập nhà cung cấp chưa nộp hồ sơ doanh nghiệp: chưa có dòng trong bảng
  // bên dưới nhưng vẫn được tính vào huy hiệu sidebar, nên phải hiện riêng ở đây.
  const loginsWithoutProfile = users
    .filter((user) => user.role === "supplier" && user.is_active && !user.supplier_id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

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
      {loginsWithoutProfile.length > 0 && <section id="logins-without-profile" className="mb-4 scroll-mt-24 rounded-xl border border-amber-200 bg-amber-50/50 p-4" aria-labelledby="logins-without-profile-title">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="logins-without-profile-title" className="text-[13.5px] font-bold text-ink-900">Tài khoản đã đăng ký, chưa nộp hồ sơ doanh nghiệp</h2>
          <span className="rounded-full bg-amber-100 px-2 text-[11.5px] font-bold text-amber-800">{loginsWithoutProfile.length}</span>
        </div>
        <p className="mt-1 text-xs text-ink-600">Đây là con số trên menu Nhà cung cấp. Các tài khoản này chưa có hồ sơ nên chưa nằm trong bảng bên dưới. Liên hệ để nhắc họ hoàn tất hồ sơ trên cổng nhà cung cấp.</p>
        <ul className="mt-3 divide-y divide-amber-100 rounded-lg border border-amber-100 bg-white text-sm">
          {loginsWithoutProfile.map((user) => <li key={user.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
            <span className="min-w-0">
              <span className="font-semibold text-ink-900">{user.name || "Chưa ghi tên"}</span>
              <a href={`mailto:${user.email}`} className="ml-2 text-brand-700 underline">{user.email}</a>
            </span>
            <span className="text-xs text-ink-500">Đăng ký {new Date(user.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" })}{user.last_login_at ? "" : " · chưa đăng nhập lại"}</span>
          </li>)}
        </ul>
      </section>}
      <SupplierTable suppliers={suppliers} usage={usage} reviewedAt={reviewedAt} canManage={canManage} />
    </>
  );
}
