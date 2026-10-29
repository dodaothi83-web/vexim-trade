"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuantityPricingEditor } from "@/components/products/quantity-pricing-editor";
import { validateQuantityPricing, type QuantityPricingInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import { submitEnglishNameRevisionAction, submitQuantityPriceRevisionAction } from "../../../quantity-revision-actions";

type Props = {
  productId: string; updatedAt: string; nameVi: string; nameEn: string;
  pendingPriceId: string | null; pendingNameId: string | null; hasApprovedPrice: boolean; hasApprovedName: boolean;
  grade: string; incoterm: string; tiers: QuantityPricingInput["tiers"];
  standardGrades: string[]; policy: QuantityPricingPolicy; buyerPriceUnit: "kg" | "mt"; pricePubliclyVisible: boolean;
};
type Result = { ok: boolean; message: string };

export function QuantityPricingPreviewForm(props: Props) {
  const router = useRouter();
  const [value, setValue] = useState<QuantityPricingInput>({ grade: props.grade, incoterm: props.incoterm, nameVi: props.nameVi, nameEn: props.nameEn, tiers: props.tiers });
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [priceResult, setPriceResult] = useState<Result | null>(null);
  const [nameResult, setNameResult] = useState<Result | null>(null);
  const baseForm = () => {
    const form = new FormData();
    form.set("product_id", props.productId);
    form.set("expected_product_updated_at", props.updatedAt);
    form.set("name_en", value.nameEn);
    return form;
  };
  async function saveName() {
    if (busy) return;
    setBusy(true); setNameResult(null);
    const form = baseForm();
    form.set("expected_name_revision_id", props.pendingNameId ?? "");
    try {
      const result = await submitEnglishNameRevisionAction(form);
      setNameResult(result);
      if (result.ok) router.refresh();
    } catch { setNameResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  async function savePrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const validation = validateQuantityPricing(value, props.standardGrades, props.policy);
    setShowErrors(true);
    if (!validation.value) { setPriceResult({ ok: false, message: validation.errors[0]?.message ?? "Kiểm tra bảng giá." }); return; }
    const form = new FormData(event.currentTarget);
    form.set("product_id", props.productId);
    form.set("expected_product_updated_at", props.updatedAt);
    form.set("expected_price_revision_id", props.pendingPriceId ?? "");
    form.set("name_en", value.nameEn);
    form.set("grade", value.grade);
    form.set("incoterm", value.incoterm);
    form.set("quantity_tiers_json", JSON.stringify(value.tiers));
    setBusy(true); setPriceResult(null);
    try {
      const result = await submitQuantityPriceRevisionAction(form);
      setPriceResult(result);
      if (result.ok) router.refresh();
    } catch { setPriceResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-4">
    <div className="rounded-xl border border-ink-200 bg-white p-5 text-sm">
      <p>Tên gốc: <strong>{props.nameVi}</strong></p>
      <label className="mt-3 block font-semibold">Tên tiếng Anh (tùy chọn)
        <input className="input mt-1 w-full" maxLength={180} value={value.nameEn} onChange={(event) => setValue({ ...value, nameEn: event.target.value })} disabled={busy} />
      </label>
      <p className="mt-1 text-xs text-ink-500">Bản thử nghiệm hiện nhập tay; tự dịch và chỉnh sửa tên gốc sẽ được nối sau. Không nhập grade trong tên.</p>
      <p className="mt-2 text-xs text-ink-600">{props.pendingNameId ? "Tên tiếng Anh mới đang chờ duyệt." : props.hasApprovedName ? "Đã có tên tiếng Anh được duyệt." : "Chưa có tên tiếng Anh được duyệt trong mô hình mới."}</p>
      <button type="button" onClick={() => void saveName()} disabled={busy || !value.nameEn.trim()} className="btn btn-soft btn-sm mt-3">Gửi tên tiếng Anh để duyệt</button>
      {nameResult && <p role={nameResult.ok ? "status" : "alert"} className={`mt-2 text-xs ${nameResult.ok ? "text-emerald-700" : "text-rose-700"}`}>{nameResult.message}</p>}
    </div>
    <form onSubmit={(event) => void savePrice(event)} className="rounded-xl border border-ink-200 bg-white p-5">
      <p className="mb-4 text-xs text-ink-600">{props.pendingPriceId ? "Giá mới đang chờ Vexim xác nhận." : props.hasApprovedPrice ? "Đã có bảng giá được duyệt trong mô hình mới." : "Chưa có bảng giá được duyệt trong mô hình mới."}</p>
      <QuantityPricingEditor value={value} onChange={setValue} standardGrades={props.standardGrades} policy={props.policy}
        buyerPriceUnit={props.buyerPriceUnit} pricePubliclyVisible={props.pricePubliclyVisible} showErrors={showErrors} disabled={busy} />
      <button type="submit" disabled={busy} className="btn btn-primary btn-sm mt-4">{busy ? "Đang gửi…" : "Gửi bảng giá để duyệt"}</button>
      {priceResult && <p role={priceResult.ok ? "status" : "alert"} className={`mt-2 text-xs ${priceResult.ok ? "text-emerald-700" : "text-rose-700"}`}>{priceResult.message}</p>}
    </form>
  </div>;
}
