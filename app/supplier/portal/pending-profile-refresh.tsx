"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import type { Locale } from "@/lib/i18n/config";

/** Mounted only on the read-only waiting screen, never over an editable form. */
export function PendingProfileRefresh({ children, lang }: { children: React.ReactNode; lang: Locale }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = window.setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
  return <p lang={lang} className="mt-4 text-xs leading-5 text-ink-500">{children}</p>;
}
