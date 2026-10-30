"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useCookieConsent } from "@/components/cookie-consent";
import { publicSitePageKey } from "@/lib/traffic/site-path";

/** Browser page views, not unique visitors. Sensitive routes are excluded by an allowlist. */
export function SiteTrafficBeacon() {
  const pathname = usePathname();
  const { analyticsAllowed } = useCookieConsent();
  useEffect(() => {
    if (!analyticsAllowed) return;
    const page = publicSitePageKey(pathname);
    if (!page) return;
    try {
      const key = `vexim:site:view:${page}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 30 * 60_000) return;
      sessionStorage.setItem(key, String(Date.now()));
      fetch("/api/public/site-traffic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname }), credentials: "same-origin", keepalive: true,
      }).then((res) => { if (!res.ok) sessionStorage.removeItem(key); })
        .catch(() => sessionStorage.removeItem(key));
    } catch { /* Analytics must never block navigation or private browsing. */ }
  }, [pathname, analyticsAllowed]);
  return null;
}
