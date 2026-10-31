import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { dataStatus, getStore } from "@/lib/db";
import { supabaseProbe } from "@/lib/db";
import { emailMode } from "@/lib/config";
import { requireSession } from "@/lib/auth/session";
import { hasPermission, permissionsFor } from "@/lib/auth/permissions";
import { isOwnedBy, ownerScopeOf } from "@/lib/auth/scope";
import { loadMailboxData } from "@/lib/mail/mailbox-access";
import { Sidebar } from "@/components/sidebar";
import { sponsoredRequestStore } from "@/lib/sponsored/requests";
import { CrmTopbar } from "@/components/crm-topbar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Chưa đăng nhập thì đưa về /login (mọi trang trong nhóm này đều được bảo vệ)
  const session = await requireSession();
  if (session.role === "supplier") redirect("/supplier/portal");

  // Thử Supabase một lần thật nhẹ để biết có kết nối được hay không
  try {
    await supabaseProbe();
  } catch {
    /* bỏ qua */
  }

  // Badge chưa đọc ở menu Hộp thư. Phải đếm trên ĐÚNG tập thư mà trang /mail hiển thị
  // (loadMailboxData), nếu không nhân viên nhận thông báo "có thư mới" rồi mở ra thấy
  // danh sách trống — lỗi từng xảy ra vì badge đếm thư của cả đội, còn danh sách thì lọc theo người phụ trách.
  const canViewMail = permissionsFor(session.role).includes("mail.view");
  const mailbox = canViewMail ? await loadMailboxData(session).catch(() => null) : null;
  const unreadMail = mailbox
    ? mailbox.mailMessages.filter((m) => m.kind === "inbound" && !m.read_at).length
    : 0;

  // Buyer mới (giai đoạn lead) trong phạm vi của người dùng — badge ở menu Buyer
  let newBuyers = 0;
  if (permissionsFor(session.role).includes("buyers.view")) {
    const scope = ownerScopeOf(session);
    const buyers = mailbox?.buyers ?? (await getStore().listBuyers().catch(() => []));
    newBuyers = buyers.filter((b) => (b.stage ?? "lead") === "lead" && isOwnedBy(b.owner, scope)).length;
  }

  // Badge việc đang chờ ở các khu vực chính. Đếm bằng truy vấn head-count, không tải cả bảng.
  const store = getStore();
  const canSuppliers = hasPermission(session.role, "suppliers.view");
  const canProducts = hasPermission(session.role, "products.view");
  const canReviews = hasPermission(session.role, "verifications.view");
  // Đếm hỏng thì vẫn chạy trang, nhưng phải để lại dấu vết: trước đây lỗi bị nuốt
  // thành 0 nên huy hiệu im lặng biến mất mà không ai biết vì sao.
  const countOrZero = async (label: string, work: () => Promise<number>) => {
    try {
      return await work();
    } catch (error) {
      console.error(`[crm] đếm việc chờ cho huy hiệu "${label}" thất bại`, error);
      return 0;
    }
  };
  const canViewSponsored = hasPermission(session.role, "sponsored.view");
  const requestStore = canViewSponsored ? sponsoredRequestStore() : null;
  const countSponsoredRequests = async (): Promise<number | null> => {
    if (!canViewSponsored) return 0;
    if (!requestStore) return null;
    try {
      const actor = await requestStore.getUser(session.uid);
      if (!actor?.is_active || actor.role !== session.role || actor.email.trim().toLowerCase() !== session.email.trim().toLowerCase() ||
          !hasPermission(actor.role, "sponsored.view")) return null;
      return await requestStore.countNewSponsoredRequests();
    } catch (error) {
      console.error("[crm] không đếm được yêu cầu đẩy sản phẩm", error);
      return null; // unknown is not zero; the menu shows a warning instead
    }
  };
  const [pendingSuppliers, pendingProducts, pendingReviews, pendingSubmissions, pendingCertificates, pendingSponsoredRequests] = await Promise.all([
    canSuppliers ? countOrZero("nhà cung cấp", () => store.countSupplierAccountsPending()) : 0,
    canProducts ? countOrZero("sản phẩm", () => store.countProductsPendingReview()) : 0,
    canReviews ? countOrZero("đợt kiểm", () => store.countReviewsAwaitingApproval()) : 0,
    canReviews ? countOrZero("hồ sơ tự gửi", () => store.countSubmissionsPendingReview()) : 0,
    canReviews ? countOrZero("giấy chứng nhận", () => store.countCertificatesPendingReview()) : 0,
    countSponsoredRequests(),
  ]);

  // Chuông thông báo của CRM: cùng nguồn số với huy hiệu sidebar, nên hai nơi
  // không bao giờ lệch nhau. Chỉ đưa vào chuông hàng đang có việc.
  const queues = [
    { href: "/crm/suppliers", label: "Nhà cung cấp chờ xác nhận quyền cổng", count: pendingSuppliers },
    { href: "/crm/products?view=pending", label: "Sản phẩm nhà cung cấp chờ kiểm nội dung", count: pendingProducts },
    { href: "/crm/verifications", label: "Đợt kiểm chờ duyệt", count: pendingReviews },
    { href: "/crm/verifications/submissions", label: "Hồ sơ nhà cung cấp tự gửi chờ đối chiếu", count: pendingSubmissions },
    { href: "/crm/certificates", label: "Giấy chứng nhận chờ duyệt", count: pendingCertificates },
    { href: "/crm/sponsored#yeu-cau-ncc", label: "Yêu cầu đẩy sản phẩm mới", count: pendingSponsoredRequests ?? 0 },
    { href: "/crm/mail", label: "Thư chưa đọc", count: unreadMail },
    { href: "/crm/buyers", label: "Người mua mới chưa xử lý", count: newBuyers },
  ].filter((queue) => queue.count > 0);

  let dbMode: "supabase" | "local" = "local";
  let dbDegraded = false;
  try {
    const status = dataStatus();
    dbMode = status.mode;
    dbDegraded = status.degraded;
  } catch {
    dbMode = "local";
  }

  return (
    <>
      <Sidebar
        dataMode={dbMode}
        dataDegraded={dbDegraded}
        emailMode={emailMode()}
        session={{
          name: session.name,
          email: session.email,
          role: session.role,
        }}
        permissions={permissionsFor(session.role)}
        unreadMail={unreadMail}
        newBuyers={newBuyers}
        pendingSuppliers={pendingSuppliers}
        pendingProducts={pendingProducts}
        pendingReviews={pendingReviews}
        pendingSubmissions={pendingSubmissions}
        pendingCertificates={pendingCertificates}
        pendingSponsoredRequests={pendingSponsoredRequests}
      />
      <div className="lg:pl-60">
        <CrmTopbar queues={queues} />
        <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 pt-2 pb-16 sm:px-6 lg:px-8 lg:pt-4">
          {children}
        </main>
      </div>
    </>
  );
}
