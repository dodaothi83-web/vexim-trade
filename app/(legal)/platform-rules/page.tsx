import type { Metadata } from "next";

import { PlatformRulesDocument } from "@/components/legal/platform-rules-document";
import { PLATFORM_RULES_COPY } from "@/lib/legal/platform-rules-copy";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Platform Operating Rules | Vexim Trade" },
  description: PLATFORM_RULES_COPY.en.metaDescription,
  alternates: {
    canonical: `${SITE_URL}/platform-rules`,
    languages: {
      en: `${SITE_URL}/platform-rules`,
      vi: `${SITE_URL}/quy-che-hoat-dong`,
    },
  },
  robots: { index: true, follow: true },
};

export default function PlatformRulesPage() {
  return <PlatformRulesDocument locale="en" />;
}
