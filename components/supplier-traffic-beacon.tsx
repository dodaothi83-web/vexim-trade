"use client";

import { useEffect } from "react";

import { useCookieConsent } from "@/components/cookie-consent";

/** Count actual browser page loads, not crawler SSR/prefetch; no cookie or visitor ID. */
export function SupplierTrafficBeacon({ token, pageKey }: { token: string; pageKey: string }) {
  const { analyticsAllowed } = useCookieConsent();
  useEffect(() => {
    if (!analyticsAllowed) return;
    try {
      const key = `vexim:view:${pageKey}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 30 * 60_000) return;
      sessionStorage.setItem(key, String(Date.now()));
      fetch("/api/public/traffic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }), credentials: "same-origin", keepalive: true,
      }).then((res) => { if (!res.ok) sessionStorage.removeItem(key); })
        .catch(() => sessionStorage.removeItem(key));
    } catch { /* Tracking must never interrupt the public page, including private browsing. */ }
  }, [token, pageKey, analyticsAllowed]);
  return null;
}
