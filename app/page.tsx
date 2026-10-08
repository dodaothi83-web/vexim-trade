import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { LandingSite } from "@/components/landing-site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Veximtrade does the first pass in Vietnam",
  description:
    "Sourcing from Vietnam shouldn't cost your team weeks of screening. Veximtrade finds, vets " +
    "and filters suppliers on the ground, so you talk only to sources worth your time. " +
    "A Vexim Global company.",
  openGraph: {
    title: "Veximtrade does the first pass in Vietnam",
    description:
      "We search, vet and filter Vietnamese suppliers before they reach your inbox. " +
      "A short list worth talking to, or an honest not-yet. A Vexim Global company.",
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
