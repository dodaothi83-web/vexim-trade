import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const INDEXABLE = process.env.PUBLIC_SITE_INDEXABLE === "true";
const LEGAL_CRAWLABLE = !["preview", "development"].includes(process.env.VERCEL_ENV ?? "");

export default function robots(): MetadataRoute.Robots {
  // Always-disallowed routes (RFQ flow, compare state, back-office, auth, preview, API internals)
  const alwaysDisallow = [
    "/api/",
    "/rfq",
    "/rfq/",
    "/compare",
    "/crm",
    "/crm/",
    "/auth",
    "/auth/",
    "/login",
    "/login/",
    "/_next/",
  ];

  if (INDEXABLE) {
    return {
      rules: [
        { userAgent: "*", allow: "/", disallow: alwaysDisallow },
      ],
      sitemap: `${SITE_URL}/sitemap.xml`,
    };
  }

  // Pre-launch production: OAuth reviewers can crawl the exact homepage (/$)
  // and legal disclosures. Preview/development stays fully disallowed.
  return {
    rules: LEGAL_CRAWLABLE
      ? [{ userAgent: "*", allow: ["/$", "/privacy-policy", "/terms-of-service"], disallow: "/" }]
      : [{ userAgent: "*", disallow: "/" }],
  };
}
