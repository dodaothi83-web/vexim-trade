"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Factory,
  Loader2,
  MessageSquarePlus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  addNoteAction,
  attachSupplierAction,
  deleteBuyerAction,
  updateBuyerAction,
} from "@/app/actions";
import type { BuyerWithSupplier, Supplier } from "@/lib/types";
import { Button, cx } from "@/components/ui";
import { useToast } from "@/components/toast";

/* ------------------------- Chọn nhà cung cấp ------------------------- */

export function SupplierPicker({
  buyer,
  suppliers,
}: {
  buyer: BuyerWithSupplier;
  suppliers: Pick<Supplier, "id" | "name" | "email" | "status">[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function change(id: string) {
    setBusy(true);
    const res = await attachSupplierAction(buyer.id, id || null);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message, lines: res.details });
    setBusy(false);
    router.refresh();
  }

  async function toggleHide(value: boolean) {
    setBusy(true);
    const res = await updateBuyerAction(buyer.id, {
      ...(buyer as unknown as Record<string, unknown>),
      hide_buyer_from_supplier: value,
    });
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    setBusy(false);
    router.refresh();
  }

  const current = buyer.supplier;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="label">Nhà cung cấp của đơn</label>
          <select
            className={cx(
              "input",
              !buyer.supplier_id && "border-dashed border-amber-300 bg-amber-50/60 text-amber-900",
            )}
            value={buyer.supplier_id ?? ""}
            disabled={busy}
            onChange={(e) => void change(e.target.value)}
          >
            <option value="">— Chưa chọn nhà cung cấp —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id} disabled={s.status === "paused"}>
                {s.name}
                {!s.email ? " (thiếu email)" : s.status === "paused" ? " (tạm ngưng)" : ""}
              </option>
            ))}
          </select>
        </div>
        <a href="/suppliers/new" className="btn btn-ghost" target="_blank" rel="noreferrer">
          + Thêm NCC
        </a>
      </div>

      {current ? (
        <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3.5">
          <div className="flex items-start gap-2.5">
            <Factory className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
            <div className="min-w-0 flex-1">
              <a
                href={`/suppliers/${current.id}`}
                className="text-[13.5px] font-semibold text-ink-900 hover:text-brand-700"
              >
                {current.name}
              </a>
              <p className="mt-0.5 text-[12px] text-ink-600">
                {current.contact_name ? `${current.contact_name} · ` : ""}
                {current.email ?? <span className="text-amber-600">chưa có email</span>}
              </p>
              {current.phone && <p className="text-[12px] text-ink-500">{current.phone}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3.5 text-[12.5px] text-amber-900">
          <strong>Chưa gắn nhà cung cấp.</strong> Đây là trạng thái bình thường ở giai đoạn hỏi hàng /
          báo giá — email cập nhật hiện chỉ gửi tới buyer. Khi chốt được NCC, chọn ở trên là từ lần
          sau email sẽ gửi cho cả hai bên.
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 px-3.5 py-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#0f766e]"
          checked={buyer.hide_buyer_from_supplier}
          disabled={busy}
          onChange={(e) => void toggleHide(e.target.checked)}
        />
        <span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-800">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            Ẩn danh buyer trong email gửi NCC
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-500">
            Email cho NCC chỉ nêu “Khách hàng thị trường {buyer.country || "nước ngoài"}” thay vì tên
            buyer. Bỏ tích nếu buyer cho phép công khai.
          </span>
        </span>
      </label>
    </div>
  );
}

/* --------------------------- Gửi cập nhật ---------------------------- */

export function NoteBox({ buyerId, owner }: { buyerId: string; owner: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    const res = await addNoteAction(buyerId, text.trim(), owner);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) setText("");
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="border-b border-ink-200 p-3">
      <div className="flex gap-2">
        <textarea
          rows={2}
          className="input resize-none"
          placeholder="Thêm ghi chú nội bộ (không gửi ra ngoài)..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add();
          }}
        />
        <Button variant="soft" disabled={busy || !text.trim()} onClick={() => void add()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquarePlus className="h-4 w-4" />
          )}
          Gửi
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- Xoá -------------------------------- */

export function DeleteBuyerButton({
  buyerId,
  company,
}: {
  buyerId: string;
  company: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Xoá buyer "${company}" và toàn bộ lịch sử? Hành động này không hoàn tác được.`)) {
      return;
    }
    setBusy(true);
    const res = await deleteBuyerAction(buyerId);
    toast.push({ kind: res.ok ? "success" : "error", title: res.message });
    if (res.ok) {
      router.push("/buyers");
      router.refresh();
    } else {
      setBusy(false);
    }
  }

  return (
    <Button variant="danger" disabled={busy} onClick={() => void remove()}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Xoá
    </Button>
  );
}
