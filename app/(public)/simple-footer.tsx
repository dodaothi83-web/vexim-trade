"use client";

import { usePublicPathname } from "@/hooks/use-public-pathname";
import { PlatformLegalStrip } from "@/components/platform-legal-strip";

/** The homepage renders this same footer itself; do not render it twice. */
export function SimpleFooter() {
  const pathname = usePublicPathname();
  if (pathname === "/") return null;
  return <PlatformLegalStrip variant="footer" />;
}
