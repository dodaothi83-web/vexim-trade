"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Tự đồng bộ Hộp thư: poll /api/mail/sync mỗi `intervalMs` (chỉ khi tab hiển thị)
 * và poll ngay khi cửa sổ lấy lại focus. Version đổi => router.refresh() để server
 * render lại danh sách mạch thư + badge chưa đọc, không cần người dùng F5.
 */
export function MailLiveSync({
  version,
  intervalMs = 20000,
}: {
  version: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const known = useRef(version);

  // Server render lại (sau refresh) => prop version mới => cập nhật mốc so sánh
  useEffect(() => {
    known.current = version;
  }, [version]);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/mail/sync", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as { ok?: boolean; version?: string };
        if (stopped || !data.version || data.version === known.current) return;
        known.current = data.version;
        router.refresh();
      } catch {
        /* mất mạng tạm thời thì bỏ qua lượt này */
      }
    }

    const timer = setInterval(() => void poll(), intervalMs);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, intervalMs]);

  return null;
}
