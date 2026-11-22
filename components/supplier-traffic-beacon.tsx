"use client";

import { useEffect } from "react";

import { useCookieConsent } from "@/components/cookie-consent";

/**
 * Count actual browser page loads, not crawler SSR/prefetch; no cookie or visitor ID.
 *
 * - `token`: signed, short-lived page token (kept for pages that still render per request).
 * - `product`: the product page is a cached (ISR) page, so an embedded 10-minute token would
 *   expire; it sends only category slug + product id and /api/public/traffic re-checks
 *   everything (published category, listed card, non-demo, real supplier, no staff session).
 * - `profile`: the supplier profile is also a cached (ISR) page; it sends supplier id + public
 *   slug and the API re-checks the profile (published, same slug, not a test profile, no staff
 *   session) exactly as it did for the old signed profile token.
 */
export function SupplierTrafficBeacon({ token, product, profile, pageKey }: {
  token?: string; product?: { slug: string; productId: string };
  profile?: { supplierId: string; slug: string }; pageKey: string;
}) {
  const productSlug = product?.slug;
  const productId = product?.productId;
  const profileSupplierId = profile?.supplierId;
  const profileSlug = profile?.slug;
  const { analyticsAllowed } = useCookieConsent();
  useEffect(() => {
    if (!analyticsAllowed) return;
    const payload = token ? { token }
      : productSlug && productId ? { product: { slug: productSlug, productId } }
      : profileSupplierId && profileSlug ? { profile: { supplierId: profileSupplierId, slug: profileSlug } }
      : null;
    if (!payload) return;
    try {
      const key = `vexim:view:${pageKey}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 30 * 60_000) return;
      sessionStorage.setItem(key, String(Date.now()));
      fetch("/api/public/traffic", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), credentials: "same-origin", keepalive: true,
      }).then((res) => { if (!res.ok) sessionStorage.removeItem(key); })
        .catch(() => sessionStorage.removeItem(key));
    } catch { /* Tracking must never interrupt the public page, including private browsing. */ }
  }, [token, productSlug, productId, profileSupplierId, profileSlug, pageKey, analyticsAllowed]);
  return null;
}
