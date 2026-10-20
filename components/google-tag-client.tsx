"use client";

import { useEffect } from "react";
import Script from "next/script";

import { useCookieConsent } from "@/components/cookie-consent";

type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  [key: string]: unknown;
};

/**
 * Google Analytics chỉ được tải sau khi visitor bật nhóm Analytics.
 * Nếu visitor rút lại lựa chọn, Consent Mode được cập nhật về denied và
 * cờ ga-disable của Google được bật ngay trong phiên đang mở.
 */
export function GoogleTagClient({ id }: { id: string }) {
  const { analyticsAllowed, ready } = useCookieConsent();

  useEffect(() => {
    if (!ready) return;
    const analyticsWindow = window as unknown as GtagWindow;
    if (typeof analyticsWindow.gtag === "function") {
      analyticsWindow.gtag("consent", "update", {
        analytics_storage: analyticsAllowed ? "granted" : "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    }
    analyticsWindow[`ga-disable-${id}`] = !analyticsAllowed;
  }, [analyticsAllowed, id, ready]);

  if (!analyticsAllowed) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="google-tag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('consent', 'default', {
  analytics_storage: 'granted',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied'
});
gtag('config', '${id}');`}
      </Script>
    </>
  );
}
