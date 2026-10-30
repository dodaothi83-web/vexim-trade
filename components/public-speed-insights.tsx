"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { useCookieConsent } from "@/components/cookie-consent";
import { filterPublicSpeedInsight } from "@/lib/public/speed-insights";

export function PublicSpeedInsights() {
  const { analyticsAllowed } = useCookieConsent();
  if (!analyticsAllowed) return null;
  return <SpeedInsights beforeSend={filterPublicSpeedInsight} />;
}
