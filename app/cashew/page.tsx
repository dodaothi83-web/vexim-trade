import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";

import { CashewLanding } from "@/components/cashew-landing";
import { GoogleTag } from "@/components/google-tag";
import { CASHEW_FAQS, CASHEW_PHOTOS, type CashewPhotoKey } from "@/lib/cashew-content";
import { SITE_URL } from "@/lib/site";

/**
 * Trang đích quảng cáo hạt điều cho thị trường Mỹ (brief 12/10/2026).
 * Đọc utm_* từ query nên trang render động; lực đẩy tốc độ nằm ở ảnh WebP, không ở HTML.
 */
export const dynamic = "force-dynamic";

const PAGE_TITLE = "Vietnamese Cashew Kernels for U.S. Importers | Veximtrade";
const PAGE_DESCRIPTION =
  "Vietnamese cashew kernels, W180 to W450, matched to your spec — no mark-up on the producer’s price. A written reply by the start of your next business day.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: PAGE_TITLE },
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/cashew" },
  openGraph: {
    type: "website",
    url: "/cashew",
    siteName: "Veximtrade",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: PAGE_TITLE, description: PAGE_DESCRIPTION },
};

/** Những tham số cần giữ lại theo lead để đối chiếu chi phí quảng cáo với hồ sơ thật */
const TRACKED_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid"];

function readAttribution(searchParams: Record<string, string | string[] | undefined>): string | null {
  const parts: string[] = [];
  for (const key of TRACKED_PARAMS) {
    const raw = searchParams[key];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (value && value.length <= 120) parts.push(`${key}=${value}`);
  }
  return parts.length ? parts.join(" ") : null;
}

export default async function CashewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const attribution = readAttribution(sp);

  // Ảnh nào đã có file thật thì mới hiển thị; chưa có thì trang vẽ ô placeholder (xem lib/cashew-content.ts)
  const photosReady = Object.fromEntries(
    (Object.keys(CASHEW_PHOTOS) as CashewPhotoKey[]).map((key) => [
      key,
      existsSync(join(process.cwd(), "public", "cashew", CASHEW_PHOTOS[key].file)),
    ]),
  ) as Partial<Record<CashewPhotoKey, boolean>>;

  const url = new URL("/cashew", SITE_URL).href;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: new URL("/", SITE_URL).href },
        { "@type": "ListItem", position: 2, name: "Cashew kernels", item: url },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: CASHEW_FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <>
      <GoogleTag />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <CashewLanding photosReady={photosReady} attribution={attribution} />
    </>
  );
}
