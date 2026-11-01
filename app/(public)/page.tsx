import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { GoogleTag } from "@/components/google-tag";
import { COMPANY } from "@/lib/config";
import { SITE_URL } from "@/lib/site";
import { safeJsonLd } from "@/lib/public/supplier-seo";
import HomeContent from "./home";
import { HOME_META_DESCRIPTION } from "@/lib/public/meta-copy";

export const dynamic = "force-dynamic";

/**
 * Ảnh nền trang chủ do mình tự đặt: thả một trong các tệp dưới vào đúng thư mục là trang
 * dùng ngay, không phải sửa mã. Chưa có tệp nào thì giữ ảnh thật trên Pexels.
 * Kích thước nên xuất: 1600x1067, WebP hoặc JPG dưới 300 KB, chủ thể lệch phải.
 * Xem thêm public/images/home/README.md.
 */
const HOME_HERO_LOCAL_FILES = [
  "/images/home/hero-farmer.webp",
  "/images/home/hero-farmer.jpg",
  "/images/home/hero-farmer.png",
] as const;

const HOME_TITLE = "Vexim Trade – Find Verified Food & Agricultural Products and Suppliers in Vietnam";
const HOME_DESCRIPTION = HOME_META_DESCRIPTION;
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
    images: [{ url: HOME_IMAGE, alt: "Verified Vietnamese food & agricultural products on Vexim Trade" }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [HOME_IMAGE],
  },
};

/**
 * Root công khai (/) — trang chủ Vexim Trade đa ngành (song ngữ Anh - Việt, mặc định Tiếng Anh).
 * - Đã đăng nhập → /crm/dashboard.
 * - Host nội bộ (crm.*, *.vercel.app) → /login cho đội ngũ.
 * - Khác → render HomeContent (hero đa ngành + CTA tới /rfq).
 * Layout của group (public) tự wrap header + footer.
 */
export default async function PublicHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; cat?: string; lang?: string }>;
}) {
  // Đọc mỗi lần render: thả ảnh vào public/images/home là trang đổi ngay, không phải restart.
  const heroLocal = HOME_HERO_LOCAL_FILES.find((file) =>
    existsSync(join(process.cwd(), "public", file))) ?? null;
  const session = await getSession();
  if (session) redirect("/crm/dashboard");
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  if (host.startsWith("crm.") || host.endsWith(".vercel.app")) redirect("/login");
  const params = searchParams ? await searchParams : {};
  const query = typeof params?.q === "string" ? params.q.trim().slice(0, 120) : "";
  const categoryFilter = typeof params?.cat === "string" ? params.cat.trim().slice(0, 60) : "";
  const lang: "en" | "vi" = params?.lang === "vi" ? "vi" : "en";
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
          "Vexim Trade connects international and domestic buyers with verified Vietnamese food & agricultural suppliers across core product categories and sub-groups. Buyers can browse supplier listings, request a quote from a supplier they choose, or send requirements and we look for suppliers that match. Supplier verification covers business documents, automated certificate holder (Owner vs. Partner Entity) & expiration recognition, factory photo evidence, and export delivery history. Vexim also provides Vietnamese manufacturers with free marketplace listing, international trade website design, business banner advertising consultations, and US FDA compliance consulting. After an introduction, buyers contract directly with the chosen supplier; Vexim does not hold buyer payments.",
        url: SITE_URL,
        logo: `${SITE_URL}/logo-vexim.png`,
        email: COMPANY.contactEmail,
        telephone: COMPANY.phone,
        address: { "@type": "PostalAddress", streetAddress: COMPANY.address, addressCountry: "VN" },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: COMPANY.name,
        inLanguage: lang,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
  return (
    <>
      <GoogleTag />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <HomeContent query={query} categoryFilter={categoryFilter} lang={lang} heroSrc={heroLocal} />
    </>
  );
}
