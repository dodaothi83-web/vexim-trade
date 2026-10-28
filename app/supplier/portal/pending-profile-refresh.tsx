"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Mounted only on the read-only waiting screen, never over an editable form. */
export function PendingProfileRefresh() {
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
  return <p className="mb-3 text-xs text-ink-500">Trạng thái tự cập nhật khi trang đang mở.</p>;
}
