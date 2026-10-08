"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import type { Prospect } from "@/lib/types";
import { PROSPECT_STATUSES, prospectStatusLabel } from "@/lib/prospects/status";

export function ProspectTable({ prospects }: { prospects: Prospect[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [targetProduct, setTargetProduct] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const productGroups = useMemo(
    () => [...new Set(prospects.map((prospect) => prospect.target_product?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "vi")),
    [prospects],
  );
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return prospects.filter((prospect) => {
      if (status !== "all" && prospect.status !== status) return false;
      if (targetProduct !== "all" && prospect.target_product !== targetProduct) return false;
      if (!needle) return true;
      return [prospect.company, prospect.contact_name, prospect.contact_title, prospect.email, prospect.country, prospect.industry, prospect.target_product, prospect.data_source, prospect.source_list]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [prospects, query, status, targetProduct]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstRow = rows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(currentPage * pageSize, rows.length);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-ink-200 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input className="input pl-9" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm công ty, đầu mối, email..." />
        </div>
        <select className="input w-auto min-w-[180px]" value={targetProduct} onChange={(event) => { setTargetProduct(event.target.value); setPage(1); }}>
          <option value="all">Mọi nhóm hàng</option>
          {productGroups.map((product) => <option key={product} value={product}>{product}</option>)}
        </select>
        <select className="input w-auto min-w-[180px]" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="all">Mọi trạng thái</option>
          {PROSPECT_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse">
            <thead><tr>
              <th className="table-th">Công ty / người liên hệ</th>
              <th className="table-th">Nhóm hàng mục tiêu</th>
              <th className="table-th">Ngành</th>
              <th className="table-th">Thị trường</th>
              <th className="table-th">Trạng thái</th>
              <th className="table-th">Nguồn dữ liệu</th>
              <th className="table-th">Tệp tiếp cận</th>
              <th className="table-th">Phụ trách</th>
              <th className="table-th" />
            </tr></thead>
            <tbody>
              {visibleRows.map((prospect) => (
                <tr key={prospect.id} className="group border-t border-ink-100 transition hover:bg-brand-50/40">
                  <td className="table-td">
                    <Link href={`/prospects/${prospect.id}`} className="block max-w-[300px] truncate text-[13.5px] font-semibold text-ink-900 hover:text-brand-700">{prospect.company}</Link>
                    <p className="mt-0.5 text-[11.5px] text-ink-500">{[prospect.contact_name, prospect.contact_title, prospect.email].filter(Boolean).join(" · ") || "Chưa có người liên hệ"}</p>
                  </td>
                  <td className="table-td text-[12.5px]">{prospect.target_product || "Chưa gắn nhóm"}</td>
                  <td className="table-td text-[12.5px]">{prospect.industry || "—"}</td>
                  <td className="table-td text-[12.5px]">{[prospect.city, prospect.country].filter(Boolean).join(", ") || "—"}</td>
                  <td className="table-td"><span className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-700">{prospectStatusLabel(prospect.status)}</span></td>
                  <td className="table-td text-[12px] text-ink-500">{prospect.data_source || "Chưa rõ"}</td>
                  <td className="table-td text-[12px] text-ink-500">{prospect.source_list || "Chưa phân nhóm"}</td>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 px-4 py-3">
        <p className="text-[11.5px] text-ink-500">Đang hiển thị {firstRow}-{lastRow} trong {rows.length} đầu mối{rows.length !== prospects.length ? ` (tổng ${prospects.length})` : ""}. Mỗi trang tối đa ${pageSize} dòng.</p>
        {rows.length > pageSize && (
          <nav aria-label="Phân trang danh sách khách hàng mục tiêu" className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost px-2.5 py-1.5" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Trang trước">
              <ChevronLeft className="h-4 w-4" /> Trước
            </button>
            <span className="min-w-[84px] text-center text-[12px] text-ink-600">Trang {currentPage} / {pageCount}</span>
            <button type="button" className="btn btn-ghost px-2.5 py-1.5" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Trang sau">
              Sau <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}
