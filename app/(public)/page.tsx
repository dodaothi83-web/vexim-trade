import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { GoogleTag } from "@/components/google-tag";
import { COMPANY } from "@/lib/config";
import { SITE_URL } from "@/lib/site";
import { safeJsonLd } from "@/lib/public/supplier-seo";
import HomeContent from "./home";

export const dynamic = "force-dynamic";

const HOME_TITLE = "Vexim Trade – Verified Vietnamese food & agriculture sourcing";
const HOME_DESCRIPTION =
  "Browse verified Vietnamese suppliers and request a quote from the one you choose, or send your requirements and Vexim will shortlist suppliers that match.";
const HOME_IMAGE = "/images/home/hero-cashew-texture.jpg";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
    siteName: "Vexim Trade",
    type: "website",
    images: [{ url: HOME_IMAGE, alt: "Vietnamese agricultural products sourced by Vexim Trade" }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [HOME_IMAGE],
  },
};

/**
 * Root công khai (/) — trang chủ Vexim Trade đa ngành.
 * - Đã đăng nhập → /crm/dashboard.
 * - Host nội bộ (crm.*, *.vercel.app) → /login cho đội ngũ.
 * - Khác → render HomeContent (hero đa ngành + CTA tới /rfq).
 * Layout của group (public) tự wrap header + footer.
 */
export default async function PublicHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; cat?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/crm/dashboard");
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  if (host.startsWith("crm.") || host.endsWith(".vercel.app")) redirect("/login");
  const params = searchParams ? await searchParams : {};
  const query = typeof params?.q === "string" ? params.q.trim().slice(0, 120) : "";
  const categoryFilter = typeof params?.cat === "string" ? params.cat.trim().slice(0, 60) : "";
  // Schema nền cho trang chủ: tổ chức + website. Không khai SearchAction vì site không có trang tìm kiếm công khai.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: COMPANY.name,
        legalName: COMPANY.legalName,
        description:
          "Vexim Trade connects international buyers with verified Vietnamese suppliers. Buyers can browse supplier listings, request a quote from a supplier they choose, or send requirements for Vexim to shortlist matching suppliers. After an introduction, buyers contract directly with the chosen supplier; Vexim does not hold buyer payments.",
        url: SITE_URL,
        logo: `${SITE_URL}/logo-vexim.png`,
        email: COMPANY.email,
        telephone: COMPANY.phone,
        address: { "@type": "PostalAddress", streetAddress: COMPANY.address, addressCountry: "VN" },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: COMPANY.name,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
  return (
    <>
      <GoogleTag />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <HomeContent query={query} categoryFilter={categoryFilter} />
    </>
  );
}
