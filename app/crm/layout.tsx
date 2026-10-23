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
  const [pendingSuppliers, pendingProducts, pendingReviews] = await Promise.all([
    canSuppliers ? store.countSupplierAccountsPending().catch(() => 0) : 0,
    canProducts ? store.countProductsPendingReview().catch(() => 0) : 0,
    canReviews ? store.countReviewsAwaitingApproval().catch(() => 0) : 0,
  ]);

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
      />
      <div className="lg:pl-60">
        <main className="mx-auto min-h-screen w-full max-w-[1500px] px-4 pt-16 pb-16 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </>
  );
}
