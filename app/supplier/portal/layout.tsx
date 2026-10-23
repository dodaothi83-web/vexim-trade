import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/session";
import { getStore } from "@/lib/db";
import { portalApproved } from "@/lib/supplier-portal/onboarding";
import { isSyntheticSupplier } from "@/lib/public/supplier-seo";
import { SupplierSidebar } from "@/components/supplier-sidebar";
import { SupplierTopbar } from "@/components/supplier-topbar";

export const dynamic = "force-dynamic";

/**
 * Khung chung cho cổng nhà cung cấp, dùng đúng bố cục của khu CRM: menu trái cố định
 * 240px, nội dung lệch phải, cùng bề rộng tối đa và cùng khoảng đệm. Trước đây mỗi
 * trang tự dựng `<main>` riêng nên mỗi trang một kiểu.
 *
 * Chỉ đọc phiên, tên doanh nghiệp và trạng thái mở cổng. Không tải sản phẩm, RFQ hay
 * thông báo ở đây: một bảng thiếu migration không được làm hỏng cả khung trang.
 */
export default async function SupplierPortalLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  if (session.role !== "supplier") redirect("/crm/dashboard");

  const store = getStore();
  let user: Awaited<ReturnType<typeof store.getUser>> | null = null;
  let supplier: Awaited<ReturnType<typeof store.getSupplier>> | null = null;
  let identityFailed = false;
  try {
    user = await store.getUser(session.uid);
    supplier = user?.supplier_id ? await store.getSupplier(user.supplier_id) : null;
  } catch (error) {
    identityFailed = true;
    console.error("[supplier-portal] chưa đọc được tên doanh nghiệp cho menu trái", error);
  }

  if (!identityFailed && (!user || !user.is_active || user.role !== "supplier")) redirect("/login");

  const approved = !!supplier && portalApproved(supplier);
  const publicUrl = supplier && approved && supplier.status === "published" && !isSyntheticSupplier(supplier)
    ? `/suppliers/${encodeURIComponent(supplier.slug || supplier.id)}`
    : null;

  return (
    <>
      <SupplierSidebar
        supplierName={supplier?.display_name || supplier?.trade_name || supplier?.name || "Chưa có hồ sơ doanh nghiệp"}
        email={user?.email || session.email}
        userName={user?.name ?? session.name}
        approved={approved}
        publicUrl={publicUrl}
      />
      <div className="lg:pl-60">
        <SupplierTopbar />
        <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 pt-6 pb-16 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </>
  );
}
