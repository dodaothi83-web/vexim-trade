"use client";

import { usePathname } from "next/navigation";
import { PlatformLegalStrip } from "@/components/platform-legal-strip";

/** The homepage renders this same footer itself; do not render it twice. */
export function SimpleFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <PlatformLegalStrip variant="footer" />;
}
