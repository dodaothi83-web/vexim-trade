import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { GoogleTag } from "@/components/google-tag";
import HomeContent from "./home";

export const dynamic = "force-dynamic";

/**
 * Root công khai (/) — trang chủ Vexim Trade đa ngành.
 * - Đã đăng nhập → /crm/dashboard.
 * - Host nội bộ (crm.*, *.vercel.app) → /login cho đội ngũ.
 * - Khác → render HomeContent (hero đa ngành + CTA tới /rfq).
 * Layout của group (public) tự wrap header + footer.
 */
export default async function PublicHomePage() {
  const session = await getSession();
  if (session) redirect("/crm/dashboard");
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  if (host.startsWith("crm.") || host.endsWith(".vercel.app")) redirect("/login");
  return (
    <>
      <GoogleTag />
      <HomeContent />
    </>
  );
}
