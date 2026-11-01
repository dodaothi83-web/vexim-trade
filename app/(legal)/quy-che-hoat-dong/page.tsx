import type { Metadata } from "next";

import { PlatformRulesDocument } from "@/components/legal/platform-rules-document";
import { PLATFORM_RULES_COPY } from "@/lib/legal/platform-rules-copy";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Quy chế hoạt động | Vexim Trade" },
  description: PLATFORM_RULES_COPY.vi.metaDescription,
  alternates: {
    canonical: `${SITE_URL}/quy-che-hoat-dong`,
    languages: {
      vi: `${SITE_URL}/quy-che-hoat-dong`,
      en: `${SITE_URL}/platform-rules`,
    },
  },
  robots: { index: true, follow: true },
};

export default function PlatformRulesPage() {
  return <PlatformRulesDocument locale="vi" />;
}
