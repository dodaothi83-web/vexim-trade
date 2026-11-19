"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatVnd, SUPPLIER_PLAN_LABELS, SUPPLIER_PLANS, type SupplierPlan, type SupplierPlanCatalog } from "@/lib/supplier-plans";
import { setSupplierPlanAction } from "./plan-actions";

/** yyyy-mm-dd theo giờ Việt Nam. */
function vnDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

/** Cộng tháng vào một ngày yyyy-mm-dd; ngày 31 sang tháng ngắn thì lùi về cuối tháng. */
function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * Chọn gói cho nhà cung cấp. Gói trả phí chọn thời hạn theo bảng giá (ngày hết hạn tự tính,
 * gia hạn cùng gói thì nối tiếp hạn cũ) hoặc tự chọn ngày, kèm số tiền ghi nhận cho báo cáo.
 */
export function SupplierPlanControls({ supplierId, storedPlan, effectivePlan, expiresOn, expired, productCount, canManage, catalog }: {
  supplierId: string;
  storedPlan: SupplierPlan;
  effectivePlan: SupplierPlan;
  /** yyyy-mm-dd theo giờ Việt Nam, hoặc rỗng. */
  expiresOn: string;
  expired: boolean;
  productCount: number;
  canManage: boolean;
  catalog: SupplierPlanCatalog;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<SupplierPlan>(storedPlan);
  const [term, setTerm] = useState<string>(() => String(catalog[storedPlan].prices[0]?.months ?? "custom"));
  const [date, setDate] = useState(expiresOn);
  const [amount, setAmount] = useState<string>(() => String(catalog[storedPlan].prices[0]?.price_vnd ?? ""));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const limitLabel = (value: SupplierPlan) => catalog[value].maxProducts === null ? "Không giới hạn" : `${catalog[value].maxProducts} sản phẩm`;
  const max = catalog[effectivePlan].maxProducts;
  const newMax = catalog[plan].maxProducts;
  const overNewLimit = newMax !== null && productCount > newMax;
  const prices = catalog[plan].prices;
  // Gia hạn cùng gói còn hiệu lực thì nối tiếp ngày hết hạn cũ, còn lại tính từ hôm nay.
  const today = vnDay(new Date());
  const start = plan === storedPlan && !expired && expiresOn && expiresOn > today ? expiresOn : today;
  const months = term === "custom" ? null : Number(term);
  const computedDate = months ? addMonths(start, months) : date;

  function choosePlan(value: SupplierPlan) {
    setPlan(value);
    const first = catalog[value].prices[0];
    setTerm(first ? String(first.months) : "custom");
    setAmount(first ? String(first.price_vnd) : "");
  }
  function chooseTerm(value: string) {
    setTerm(value);
    const price = prices.find((p) => String(p.months) === value);
    setAmount(price ? String(price.price_vnd) : "");
  }

  async function save() {
    setBusy(true);
    setResult(null);
    const form = new FormData();
    form.set("supplier_id", supplierId);
    form.set("plan", plan);
    form.set("expires_on", plan === "basic" ? "" : computedDate);
    if (plan !== "basic") {
      if (months) form.set("months", String(months));
      form.set("amount_vnd", amount.replace(/[^\d]/g, ""));
    }
    const response = await setSupplierPlanAction(form);
    setResult(response);
    setBusy(false);
    if (response.ok) router.refresh();
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-700">
        Đang dùng: <strong className="text-ink-900">{catalog[effectivePlan].name}</strong> · {productCount}{max === null ? " sản phẩm · không giới hạn" : `/${max} sản phẩm`}
        {expired && <span className="ml-1 text-amber-800">(gói {catalog[storedPlan].name} đã hết hạn)</span>}
      </p>
      {canManage ? <>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Chọn gói">
          {SUPPLIER_PLANS.map((value) => (
            <button key={value} type="button" role="radio" aria-checked={plan === value} onClick={() => choosePlan(value)}
              className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold ${plan === value ? "border-brand-700 bg-brand-50 text-brand-900" : "border-ink-200 text-ink-700 hover:bg-ink-50"}`}>
              {catalog[value].name || SUPPLIER_PLAN_LABELS[value]}<span className="block text-[11px] font-normal text-ink-500">{limitLabel(value)}</span>
            </button>
          ))}
        </div>
        {plan !== "basic" && <>
          <label className="block text-xs font-medium text-ink-700">Thời hạn
            <select value={term} onChange={(event) => chooseTerm(event.target.value)} className="input mt-1 w-full">
              {prices.map((p) => <option key={p.months} value={String(p.months)}>{p.months} tháng · {formatVnd(p.price_vnd)}</option>)}
              <option value="custom">Tự chọn ngày hết hạn</option>
            </select>
          </label>
          {term === "custom"
            ? <label className="block text-xs font-medium text-ink-700">Hết hạn ngày (bỏ trống nếu không hết hạn)
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input mt-1 w-full" />
            </label>
            : <p className="text-xs text-ink-600">Hết hạn ngày <strong className="text-ink-900">{computedDate.split("-").reverse().join("/")}</strong>
              {start !== today && " (nối tiếp hạn hiện tại)"}</p>}
          <label className="block text-xs font-medium text-ink-700">Số tiền ghi nhận (₫)
            <input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0 nếu dùng thử hoặc tặng" className="input mt-1 w-full tabular-nums" />
            <span className="mt-1 block font-normal text-ink-500">Dùng cho báo cáo doanh thu ước tính. Để 0 khi dùng thử hoặc tặng.</span>
          </label>
        </>}
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
