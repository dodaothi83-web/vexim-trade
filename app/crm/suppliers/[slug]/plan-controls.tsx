"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SUPPLIER_PLAN_LABELS, SUPPLIER_PLAN_RULES, SUPPLIER_PLANS, type SupplierPlan } from "@/lib/supplier-plans";
import { setSupplierPlanAction } from "./plan-actions";

/** Chọn gói và ngày hết hạn cho nhà cung cấp; hết hạn thì hệ thống tự tính là Basic. */
export function SupplierPlanControls({ supplierId, storedPlan, effectivePlan, expiresOn, expired, productCount, canManage }: {
  supplierId: string;
  storedPlan: SupplierPlan;
  effectivePlan: SupplierPlan;
  /** yyyy-mm-dd theo giờ Việt Nam, hoặc rỗng. */
  expiresOn: string;
  expired: boolean;
  productCount: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<SupplierPlan>(storedPlan);
  const [date, setDate] = useState(expiresOn);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const max = SUPPLIER_PLAN_RULES[effectivePlan].maxProducts;
  const overNewLimit = productCount > SUPPLIER_PLAN_RULES[plan].maxProducts;

  async function save() {
    setBusy(true);
    setResult(null);
    const form = new FormData();
    form.set("supplier_id", supplierId);
    form.set("plan", plan);
    form.set("expires_on", plan === "basic" ? "" : date);
    const response = await setSupplierPlanAction(form);
    setResult(response);
    setBusy(false);
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-700">
        Đang dùng: <strong className="text-ink-900">{SUPPLIER_PLAN_LABELS[effectivePlan]}</strong> · {productCount}/{max} sản phẩm
        {expired && <span className="ml-1 text-amber-800">(gói {SUPPLIER_PLAN_LABELS[storedPlan]} đã hết hạn)</span>}
      </p>
      {canManage ? <>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Chọn gói">
          {SUPPLIER_PLANS.map((value) => (
            <button key={value} type="button" role="radio" aria-checked={plan === value} onClick={() => setPlan(value)}
              className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold ${plan === value ? "border-brand-700 bg-brand-50 text-brand-900" : "border-ink-200 text-ink-700 hover:bg-ink-50"}`}>
              {SUPPLIER_PLAN_LABELS[value]}<span className="block text-[11px] font-normal text-ink-500">{SUPPLIER_PLAN_RULES[value].maxProducts} sản phẩm</span>
            </button>
          ))}
        </div>
        {plan !== "basic" && (
          <label className="block text-xs font-medium text-ink-700">Hết hạn ngày (bỏ trống nếu không hết hạn)
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input mt-1 w-full" />
          </label>
        )}
        {overNewLimit && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Nhà cung cấp đang có {productCount} sản phẩm, vượt mức gói này. Sản phẩm cũ vẫn giữ nguyên, nhưng họ không thêm được sản phẩm mới.
          </p>
        )}
        <button type="button" onClick={save} disabled={busy}
          className="rounded-lg bg-brand-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-60">
          {busy ? "Đang lưu…" : "Lưu gói"}
        </button>
        {result && <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-800" : "text-rose-800"}`}>{result.message}</p>}
      </> : <p className="text-xs text-ink-500">Bạn không có quyền đổi gói.</p>}
    </div>
  );
}
