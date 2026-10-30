import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

/** Back-office root: /crm → /crm/dashboard (nếu đã đăng nhập) hoặc /login. */
export default async function CrmIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect("/crm/dashboard");
}
