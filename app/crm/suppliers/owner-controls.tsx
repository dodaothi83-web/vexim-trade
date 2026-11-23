"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Shuffle, UserRound } from "lucide-react";

import { assignSupplierOwnerAction, distributeSuppliersAction } from "./owner-actions";

/** Nút chia đều NCC chưa giao, nằm trong thanh lọc "Phụ trách" của danh sách. */
export function DistributeSuppliersButton({ unassigned, staffCount }: { unassigned: number; staffCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (unassigned === 0 && !message) return null;

  async function run() {
    if (!window.confirm(`Chia đều ${unassigned} nhà cung cấp chưa giao cho ${staffCount} nhân viên kinh doanh?`)) return;
    setBusy(true);
    setMessage(null);
    const result = await distributeSuppliersAction();
    setMessage({ ok: result.ok, text: result.message });
    setBusy(false);
    if (result.ok) router.refresh();
  }

  return (
    <span className="ml-auto inline-flex items-center gap-2">
      {message && <span className={message.ok ? "text-[12px] text-emerald-700" : "text-[12px] text-rose-700"} role="status">{message.text}</span>}
      {unassigned > 0 && (
        <button type="button" onClick={run} disabled={busy || staffCount === 0}
          title={staffCount === 0 ? "Chưa có nhân viên kinh doanh đang hoạt động" : undefined}
          className="btn btn-soft h-8 px-3 text-[12px]">
          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? "Đang chia..." : `Chia đều ${unassigned} nhà cung cấp chưa giao`}
        </button>
      )}
    </span>
  );
}

/** Thẻ "Người phụ trách" trên hồ sơ NCC. Quản trị đổi được; người khác chỉ xem. */
export function SupplierOwnerCard({ supplierId, ownerId, ownerName, ownerActive, assignedAt, staff, canAssign }: {
  supplierId: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerActive: boolean;
  /** dd/mm/yyyy theo giờ Việt Nam, hoặc rỗng. */
  assignedAt: string;
  staff: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(ownerActive && ownerId ? ownerId : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.set("supplier_id", supplierId);
    form.set("owner_id", value);
    const result = await assignSupplierOwnerAction(form);
    setMessage({ ok: result.ok, text: result.message });
    setBusy(false);
    if (result.ok) router.refresh();
  }

  const label = ownerActive && ownerName ? ownerName : ownerName ? `${ownerName} (đã nghỉ)` : "Chưa giao";
  return (
    <section className="card p-4" aria-labelledby="supplier-owner-title">
      <h2 id="supplier-owner-title" className="flex items-center gap-1.5 text-[13px] font-bold text-ink-900">
        <UserRound className="h-4 w-4 text-brand-700" aria-hidden="true" />
        Người phụ trách
      </h2>
      <p className={ownerActive ? "mt-1 text-[13.5px] font-semibold text-ink-900" : "mt-1 text-[13.5px] font-semibold text-amber-700"}>{label}</p>
      {ownerActive && assignedAt && <p className="text-[11.5px] text-ink-500">Giao ngày {assignedAt}</p>}
      {canAssign && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="input h-9 min-w-[180px] flex-1" aria-label="Chọn người phụ trách" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Chưa giao</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="btn btn-primary h-9" onClick={save} disabled={busy || value === (ownerActive && ownerId ? ownerId : "")}>
            {busy ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      )}
      {message && <p className={message.ok ? "mt-2 text-[12px] text-emerald-700" : "mt-2 text-[12px] text-rose-700"} role="status">{message.text}</p>}
    </section>
  );
}
