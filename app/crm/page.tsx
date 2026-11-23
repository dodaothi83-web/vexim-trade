import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { staffHomePath } from "@/lib/auth/permissions";

/** Back-office root: /crm → trang mở đầu theo vai trò (nếu đã đăng nhập) hoặc /login. */
export default async function CrmIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(staffHomePath(session.role));
}
