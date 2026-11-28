"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { SUPPLIER_ACTIVITY_LABELS, type SupplierActivity } from "@/lib/public/supplier-activity";

/**
 * Nhãn "Online now / Active today" cạnh tên nhà cung cấp. Hỏi ở trình duyệt vì
 * trang dựng sẵn; chưa có dữ liệu, lỗi mạng hoặc quá 24 giờ thì không hiện gì (không để chỗ trống).
 */
export function SupplierActivityBadge({ supplierId, className }: { supplierId: string; className?: string }) {
  const [activity, setActivity] = useState<SupplierActivity | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/public/supplier-activity?id=${encodeURIComponent(supplierId)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { activity?: SupplierActivity | null } | null) => {
        const value = data?.activity;
        if (value && value in SUPPLIER_ACTIVITY_LABELS) setActivity(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [supplierId]);
  if (!activity) return null;
  const online = activity === "online";
  return <span data-testid="supplier-activity" className={cx("inline-flex items-center gap-1.5", className)}>
    <span aria-hidden="true" className={cx("h-2 w-2 rounded-full", online ? "bg-emerald-500" : "bg-ink-300")} />
    {SUPPLIER_ACTIVITY_LABELS[activity]}
  </span>;
}
