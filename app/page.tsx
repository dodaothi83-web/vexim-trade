import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { LandingSite } from "@/components/landing-site";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "Vietnamese food products, represented by Veximtrade",
  description:
    "Veximtrade represents selected Vietnamese food producers in export sales. Ask about a product " +
    "and get what the producer states, what we have verified, and what is still open. " +
    "A Vexim Global company.",
  openGraph: {
    title: "Vietnamese food products, represented by Veximtrade",
    description:
      "We represent selected Vietnamese producers and tell you what is confirmed and what is still open. " +
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
