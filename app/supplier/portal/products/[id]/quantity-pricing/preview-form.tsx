"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuantityPricingEditor } from "@/components/products/quantity-pricing-editor";
import { validateQuantityPricing, type QuantityPricingInput, type QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import { submitQuantityPriceRevisionAction } from "../../../quantity-revision-actions";

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
  async function savePrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const validation = validateQuantityPricing({ ...value, nameEn: "" }, props.standardGrades, props.policy);
    setShowErrors(true);
    if (!validation.value) { setPriceResult({ ok: false, message: validation.errors[0]?.message ?? "Kiểm tra bảng giá." }); return; }
    const form = new FormData(event.currentTarget);
    form.set("product_id", props.productId);
    form.set("expected_product_updated_at", props.updatedAt);
    form.set("expected_price_revision_id", props.pendingPriceId ?? "");
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
    <form noValidate onSubmit={(event) => void savePrice(event)} className="rounded-xl border border-ink-200 bg-white p-5">
      <p className="mb-4 text-xs text-ink-600">{props.pendingPriceId ? "Giá mới đang chờ Vexim xác nhận." : props.hasApprovedPrice ? "Đã có bảng giá được duyệt trong mô hình mới." : "Chưa có bảng giá được duyệt trong mô hình mới."}</p>
      <QuantityPricingEditor value={value} onChange={setValue} standardGrades={props.standardGrades} policy={props.policy}
        buyerPriceUnit={props.buyerPriceUnit} pricePubliclyVisible={props.pricePubliclyVisible} showTitle={false} validateEnglishName={false} showErrors={showErrors} disabled={busy} />
      <button type="submit" disabled={busy} className="btn btn-primary btn-sm mt-4">{busy ? "Đang gửi…" : "Gửi bảng giá để duyệt"}</button>
      {priceResult && <p role={priceResult.ok ? "status" : "alert"} className={`mt-2 text-xs ${priceResult.ok ? "text-emerald-700" : "text-rose-700"}`}>{priceResult.message}</p>}
    </form>
  </div>;
}
