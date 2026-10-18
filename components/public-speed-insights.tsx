"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { filterPublicSpeedInsight } from "@/lib/public/speed-insights";

export function PublicSpeedInsights() {
  return <SpeedInsights beforeSend={filterPublicSpeedInsight} />;
}
