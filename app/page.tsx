import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { LandingSite } from "@/components/landing-site";
import { GoogleTag } from "@/components/google-tag";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "Verified Vietnamese food producers, matched to your brief | Veximtrade",
  description:
    "Cashew, coffee, pepper and dried fruit from Vietnam. Send Veximtrade your spec, volume and " +
    "destination. In 3–5 working days you get a shortlist where every claim is marked Stated, " +
    "Verified or Open. Free for buyers. A Vexim Global company.",
  openGraph: {
    title: "Verified Vietnamese food producers, matched to your brief | Veximtrade",
    description:
      "Send your spec, volume and destination. We return a shortlist of Vietnamese food producers " +
      "with every claim marked Stated, Verified or Open. A Vexim Global company.",
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

  return (
    <>
      <GoogleTag />
      <LandingSite />
    </>
  );
}
