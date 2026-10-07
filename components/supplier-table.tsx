"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MailWarning, MapPin, Package, Plus, Search, Star } from "lucide-react";

import type { Supplier } from "@/lib/types";
import { SUPPLIER_STATUSES, roleLabel, statusMeta } from "@/lib/supplier";
import { Badge, Button, EmptyState, cx } from "@/components/ui";

export function SupplierTable({
  suppliers,
  usage,
}: {
  suppliers: Supplier[];
  usage: Record<string, { total: number; active: number }>;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (status !== "all" && s.status !== status) return false;
      if (!needle) return true;
      return [s.name, s.products, s.province, s.contact_name, s.email]
        .filter(Boolean)
        .some((x) => (x as string).toLowerCase().includes(needle));
    });
  }, [suppliers, q, status]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Tìm xưởng, mặt hàng, tỉnh, người liên hệ..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Mọi trạng thái</option>
          {SUPPLIER_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>
              {st.label}
            </option>
          ))}
        </select>
        <Link href="/suppliers/new" className="btn btn-primary ml-auto">
          <Plus className="h-4 w-4" />
          Thêm nhà cung cấp
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title={suppliers.length === 0 ? "Chưa có nhà cung cấp nào" : "Không tìm thấy kết quả"}
          sub={
            suppliers.length === 0
              ? "Thêm xưởng / nhà cung cấp để gắn vào đơn và nhận email cập nhật tiến độ."
              : "Thử từ khoá khác."
          }
          action={
            suppliers.length === 0 ? (
              <Link href="/suppliers/new" className="btn btn-primary">
                Thêm nhà cung cấp
              </Link>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  setQ("");
                  setStatus("all");
                }}
              >
                Xoá bộ lọc
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="table-th">Nhà cung cấp</th>
                <th className="table-th">Mặt hàng</th>
                <th className="table-th">Khu vực</th>
                <th className="table-th">Liên hệ</th>
                <th className="table-th">Lead time</th>
                <th className="table-th">Đánh giá</th>
                <th className="table-th">Đơn đang chạy</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const u = usage[s.id] ?? { total: 0, active: 0 };
                return (
                  <tr key={s.id} className="group transition hover:bg-brand-50/40">
                    <td className="table-td">
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cx(
                            "mt-1 h-8 w-1 shrink-0 rounded-full",
                            statusMeta(s.status).dot,
                          )}
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/suppliers/${s.id}`}
                            className="block max-w-[260px] truncate text-[13.5px] font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {s.name}
                          </Link>
                          <p className="mt-0.5 text-[11.5px] text-ink-500">
                            {roleLabel(s.role)}
                            {s.contact_name ? ` · ${s.contact_name}` : ""}
                          </p>
                          <Badge className={`mt-1 ${statusMeta(s.status).badge}`}>
                            {statusMeta(s.status).label}
                          </Badge>
                        </div>
                      </div>
                    </td>
                    <td className="table-td max-w-[240px]">
                      <p className="truncate text-[12.5px] text-ink-700">{s.products || "—"}</p>
                    </td>
                    <td className="table-td">
                      <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-600">
                        <MapPin className="h-3 w-3 text-ink-400" />
                        {s.province || "—"}
                      </span>
                    </td>
                    <td className="table-td max-w-[200px]">
                      {s.email ? (
                        <a
                          href={`mailto:${s.email}`}
                          className="block truncate text-[12.5px] text-brand-700 hover:underline"
                        >
                          {s.email}
                        </a>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700">
                          <MailWarning className="h-3 w-3" />
                          thiếu email
                        </Badge>
                      )}
                      {s.phone && <p className="mt-0.5 text-[11.5px] text-ink-500">{s.phone}</p>}
                    </td>
                    <td className="table-td text-[12.5px] text-ink-600">
                      {s.lead_time_days ? `${s.lead_time_days} ngày` : "—"}
                    </td>
                    <td className="table-td">
                      <span className="inline-flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={cx(
                              "h-3.5 w-3.5",
                              n <= (s.rating ?? 0)
                                ? "fill-amber-400 text-amber-400"
                                : "text-ink-200",
                            )}
                          />
                        ))}
                      </span>
                    </td>
                    <td className="table-td">
                      <span className="text-[13px] font-bold text-ink-900">{u.active}</span>
                      <span className="text-[11.5px] text-ink-400"> / {u.total} đơn</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
