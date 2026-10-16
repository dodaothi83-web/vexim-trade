import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

const INDEXABLE = process.env.PUBLIC_SITE_INDEXABLE === "true";

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

  // Staging / pre-launch: block the whole public site, but still give crawlers
  // an explicit rule so they don't 404 on robots.txt.
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
