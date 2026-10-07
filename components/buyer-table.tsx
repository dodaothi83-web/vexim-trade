"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  CalendarClock,
  Globe2,
  MailWarning,
  PackageX,
  Search,
  UserPlus,
} from "lucide-react";

import { attachSupplierAction } from "@/app/actions";
import { STAGES, getStage } from "@/lib/pipeline";
import type { BuyerWithSupplier, Supplier } from "@/lib/types";
import { StageSelect, type StageTarget } from "@/components/stage-select";
import { Badge, Button, EmptyState, cx, formatDate, formatMoney } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAutoSend } from "@/components/auto-send";

type SortKey = "updated" | "value" | "company" | "ship";

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-red-50 text-red-700 ring-1 ring-red-200",
  normal: "",
  low: "bg-ink-100 text-ink-500",
};

export function BuyerTable({
  buyers,
  suppliers,
}: {
  buyers: BuyerWithSupplier[];
  suppliers: Pick<Supplier, "id" | "name">[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { value: autoSend } = useAutoSend();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("all");
  const [owner, setOwner] = useState("all");
  const [noSupplier, setNoSupplier] = useState(false);
  const [sort, setSort] = useState<SortKey>("updated");

  const owners = useMemo(
    () =>
      Array.from(new Set(buyers.map((b) => b.owner).filter((o): o is string => Boolean(o)))).sort(
        (a, b) => a.localeCompare(b, "vi"),
      ),
    [buyers],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = buyers.filter((b) => {
      if (stage !== "all" && b.stage !== stage) return false;
      if (owner !== "all" && b.owner !== owner) return false;
      if (noSupplier && b.supplier_id) return false;
      if (!needle) return true;
      return [b.company, b.contact_name, b.country, b.product, b.email, b.port]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(needle));
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "value":
          return (b.deal_value ?? 0) - (a.deal_value ?? 0);
        case "company":
          return a.company.localeCompare(b.company, "vi");
        case "ship":
          return (
            (a.expected_ship_date ?? "9999").localeCompare(b.expected_ship_date ?? "9999") ||
            a.company.localeCompare(b.company, "vi")
          );
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });
    return out;
  }, [buyers, q, stage, owner, noSupplier, sort]);

  const totalValue = rows.reduce((s, b) => s + (b.deal_value ?? 0), 0);

  async function onAttach(buyerId: string, supplierId: string) {
    const res = await attachSupplierAction(buyerId, supplierId || null);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message, lines: res.details });
    router.refresh();
  }

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input pl-9"
            placeholder="Tìm buyer, mặt hàng, quốc gia, email..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <select className="input w-auto min-w-[150px]" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="all">Mọi trạng thái</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <select className="input w-auto min-w-[140px]" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="all">Mọi người phụ trách</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-ink-300 px-3 py-1.5 text-[13px] font-medium text-ink-600 transition hover:bg-ink-50">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[#0f766e]"
            checked={noSupplier}
            onChange={(e) => setNoSupplier(e.target.checked)}
          />
          Chưa gắn NCC
        </label>

        <div className="ml-auto flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-ink-400" />
          <select
            className="input w-auto py-1.5 text-[13px]"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="updated">Mới cập nhật</option>
            <option value="value">Giá trị lớn nhất</option>
            <option value="ship">Ngày giao gần nhất</option>
            <option value="company">Tên A→Z</option>
          </select>
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-ink-200 bg-ink-50/70 px-4 py-2 text-xs text-ink-600">
        <span>
          <strong className="text-ink-900">{rows.length}</strong> buyer
        </span>
        <span>
          Tổng giá trị: <strong className="text-ink-900">{formatMoney(totalValue)}</strong>
        </span>
        <span>
          Chưa gắn NCC:{" "}
          <strong className="text-ink-900">{rows.filter((b) => !b.supplier_id).length}</strong>
        </span>
        <span>
          Thiếu email buyer:{" "}
          <strong className="text-ink-900">{rows.filter((b) => !b.email).length}</strong>
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Globe2 className="h-5 w-5" />}
          title={buyers.length === 0 ? "Chưa có buyer nào" : "Không tìm thấy buyer phù hợp"}
          sub={
            buyers.length === 0
              ? "Thêm buyer đầu tiên để bắt đầu theo dõi pipeline xuất khẩu."
              : "Thử bỏ bớt bộ lọc hoặc từ khoá tìm kiếm."
          }
          action={
            buyers.length === 0 ? (
              <Link href="/buyers/new" className="btn btn-primary">
                <UserPlus className="h-4 w-4" />
                Thêm buyer
              </Link>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  setQ("");
                  setStage("all");
                  setOwner("all");
                  setNoSupplier(false);
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
                <th className="table-th">Buyer</th>
                <th className="table-th">Mặt hàng &amp; số lượng</th>
                <th className="table-th">Nhà cung cấp</th>
                <th className="table-th">Trạng thái</th>
                <th className="table-th">Giá trị</th>
                <th className="table-th">Việc tiếp theo</th>
                <th className="table-th" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const target: StageTarget = {
                  id: b.id,
                  company: b.company,
                  stage: b.stage,
                  buyerEmail: b.email,
                  buyerCc: b.cc_emails,
                  supplierName: b.supplier?.name ?? null,
                  supplierEmail: b.supplier?.email ?? null,
                  owner: b.owner,
                };
                const overdue =
                  b.next_action_date &&
                  b.next_action_date < new Date().toISOString().slice(0, 10) &&
                  !getStage(b.stage).terminal;
                return (
                  <tr key={b.id} className="group transition hover:bg-brand-50/40">
                    <td className="table-td">
                      <div className="flex items-start gap-2.5">
                        <span
                          className="mt-1 h-8 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: getStage(b.stage).color }}
                        />
                        <div className="min-w-0">
                          <Link
                            href={`/buyers/${b.id}`}
                            className="block max-w-[230px] truncate text-[13.5px] font-semibold text-ink-900 transition hover:text-brand-700"
                          >
                            {b.company}
                          </Link>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-500">
                            {b.contact_name && <span>{b.contact_name}</span>}
                            {b.country && (
                              <span className="inline-flex items-center gap-1">
                                <Globe2 className="h-3 w-3" />
                                {b.country}
                              </span>
                            )}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {b.priority === "high" && (
                              <Badge className={PRIORITY_STYLE.high}>Ưu tiên cao</Badge>
                            )}
                            {!b.email && (
                              <Badge className="bg-amber-50 text-amber-700">
                                <MailWarning className="h-3 w-3" />
                                thiếu email
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="table-td max-w-[210px]">
                      <p className="truncate text-[13px] font-medium text-ink-800">
                        {b.product || <span className="text-ink-400">—</span>}
                      </p>
                      <p className="truncate text-[11.5px] text-ink-500">{b.quantity || ""}</p>
                    </td>
                    <td className="table-td">
                      <select
                        className={cx(
                          "w-full max-w-[180px] rounded-lg border px-2 py-1.5 text-[12px] transition",
                          b.supplier_id
                            ? "border-ink-200 bg-white text-ink-700"
                            : "border-dashed border-amber-300 bg-amber-50/70 text-amber-800",
                        )}
                        value={b.supplier_id ?? ""}
                        onChange={(e) => void onAttach(b.id, e.target.value)}
                        title={b.supplier ? (b.supplier.name ?? "") : "Chưa gắn nhà cung cấp"}
                      >
                        <option value="">— Chưa chọn —</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="table-td">
                      <StageSelect target={target} autoSend={autoSend} />
                    </td>
                    <td className="table-td">
                      <span className="text-[13px] font-semibold text-ink-800">
                        {formatMoney(b.deal_value)}
                      </span>
                      {b.incoterm && (
                        <span className="ml-1 text-[11px] text-ink-400">{b.incoterm}</span>
                      )}
                    </td>
                    <td className="table-td max-w-[220px]">
                      {b.next_action ? (
                        <>
                          <p className="truncate text-[12.5px] text-ink-700">{b.next_action}</p>
                          {b.next_action_date && (
                            <p
                              className={cx(
                                "mt-0.5 inline-flex items-center gap-1 text-[11px]",
                                overdue ? "font-semibold text-red-600" : "text-ink-400",
                              )}
                            >
                              <CalendarClock className="h-3 w-3" />
                              {overdue ? "Trễ hạn · " : ""}
                              {formatDate(b.next_action_date)}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-400">
                          <PackageX className="h-3 w-3" />
                          chưa đặt việc
                        </span>
                      )}
                      {b.owner && (
                        <p className="mt-1 text-[11px] text-ink-400">PT: {b.owner}</p>
                      )}
                    </td>
                    <td className="table-td text-right">
                      <Link
                        href={`/buyers/${b.id}`}
                        className="rounded-lg px-2 py-1 text-[12px] font-semibold text-brand-700 opacity-0 transition group-hover:opacity-100"
                      >
                        Mở →
                      </Link>
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
