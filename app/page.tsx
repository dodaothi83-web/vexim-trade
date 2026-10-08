import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { LandingSite } from "@/components/landing-site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vexim Trade — Vietnamese cashew & agricultural products export",
  description:
    "Vexim Trade exports Vietnamese cashew kernels and agricultural products to specification. " +
    "Member of Vexim Global. Request a quote — our export desk replies within one working day.",
  openGraph: {
    title: "Vexim Trade — Vietnamese cashew & agricultural products export",
    description:
      "Factory-direct sourcing, lot-by-lot QC and full export documentation. A member of Vexim Global.",
    url: "https://veximtrade.com",
    siteName: "Vexim Trade",
    type: "website",
  },
};

/**
 * Root công khai = landing page quảng bá cho buyer.
 * - Đã đăng nhập => vào thẳng CRM (/dashboard).
 * - Host làm việc nội bộ (crm.* hoặc *.vercel.app) => đưa về /login để đội ngũ dùng CRM.
 * - Host công khai (veximtrade.com…) => render landing.
 */
export default async function PublicHomePage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  const host = ((await headers()).get("host") ?? "").toLowerCase();
  if (host.startsWith("crm.") || host.endsWith(".vercel.app")) redirect("/login");

  return <LandingSite />;
}
