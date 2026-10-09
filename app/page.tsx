import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { LandingSite } from "@/components/landing-site";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "Find the right Vietnamese food producer for your brief | Veximtrade",
  description:
    "Send Veximtrade your food sourcing brief. We match it with a selected Vietnamese producer where one fits, " +
    "and tell you plainly where none does. A Vexim Global company.",
  openGraph: {
    title: "Find the right Vietnamese food producer for your brief | Veximtrade",
    description:
      "Tell us what you need. We review the brief and connect you with a suitable Vietnamese producer where available. " +
      "A Vexim Global company.",
    url: SITE_URL,
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
