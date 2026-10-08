"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { Prospect } from "@/lib/types";
import { PROSPECT_STATUSES, prospectStatusLabel } from "@/lib/prospects/status";

export function ProspectTable({ prospects }: { prospects: Prospect[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return prospects.filter((prospect) => {
      if (status !== "all" && prospect.status !== status) return false;
      if (!needle) return true;
      return [prospect.company, prospect.contact_name, prospect.contact_title, prospect.email, prospect.country, prospect.industry]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [prospects, query, status]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-ink-200 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm công ty, đầu mối, email..." />
        </div>
        <select className="input w-auto min-w-[180px]" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Mọi trạng thái</option>
          {PROSPECT_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse">
            <thead><tr>
              <th className="table-th">Công ty / người liên hệ</th>
              <th className="table-th">Ngành hàng</th>
              <th className="table-th">Thị trường</th>
              <th className="table-th">Trạng thái</th>
              <th className="table-th">Nguồn</th>
              <th className="table-th">Phụ trách</th>
              <th className="table-th" />
            </tr></thead>
            <tbody>
              {rows.map((prospect) => (
                <tr key={prospect.id} className="group border-t border-ink-100 transition hover:bg-brand-50/40">
                  <td className="table-td">
                    <Link href={`/prospects/${prospect.id}`} className="block max-w-[300px] truncate text-[13.5px] font-semibold text-ink-900 hover:text-brand-700">{prospect.company}</Link>
                    <p className="mt-0.5 text-[11.5px] text-ink-500">{[prospect.contact_name, prospect.contact_title, prospect.email].filter(Boolean).join(" · ") || "Chưa có người liên hệ"}</p>
                  </td>
                  <td className="table-td text-[12.5px]">{prospect.industry || "—"}</td>
                  <td className="table-td text-[12.5px]">{[prospect.city, prospect.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="table-td"><span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-700">{prospectStatusLabel(prospect.status)}</span></td>
                  <td className="table-td text-[12px] text-ink-500">{prospect.source_list || "Apollo"}</td>
                  <td className="table-td text-[12px] text-ink-500">{prospect.owner || "Chưa phân công"}</td>
                  <td className="table-td text-right"><Link href={`/prospects/${prospect.id}`} className="text-[12px] font-semibold text-brand-700 opacity-0 group-hover:opacity-100">Mở →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-12 text-center text-[13px] text-ink-500">{prospects.length ? "Không tìm thấy đầu mối phù hợp." : "Chưa có dữ liệu. Nhập danh sách Apollo để bắt đầu."}</div>
      )}
      <div className="border-t border-ink-100 px-4 py-2 text-[11.5px] text-ink-400">{rows.length} / {prospects.length} đầu mối</div>
    </section>
  );
}
