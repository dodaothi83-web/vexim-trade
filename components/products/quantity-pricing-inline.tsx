"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuantityPricingEditor } from "@/components/products/quantity-pricing-editor";
import { publishQuantityPreview } from "@/components/products/quantity-preview-store";
import { validateQuantityPricing, type QuantityPricingInput } from "@/lib/products/quantity-pricing";
import type { QuantityEditorData } from "@/lib/products/quantity-editor-data";
import { submitQuantityPriceRevisionAction } from "@/app/supplier/portal/quantity-revision-actions";
import { submitStaffQuantityPriceAction } from "@/app/crm/products/quantity-review/submit-actions";

/** Independent revision submission inside an existing product form; never mutates legacy price fields. */
export function QuantityPricingInline({ data, actor, disabled = false, dirty = false, onPreviewChange, publishPreview = false }: {
  data: QuantityEditorData; actor: "staff" | "supplier"; disabled?: boolean; dirty?: boolean;
  onPreviewChange?: (value: QuantityPricingInput) => void;
  /** Đẩy bảng giá đang nhập sang thẻ "Người mua sẽ thấy" ở cột phải (CRM). */
  publishPreview?: boolean;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<QuantityPricingInput>({ grade: data.grade, incoterm: data.incoterm, currency: data.currency,
    nameVi: data.nameVi, nameEn: actor === "supplier" ? data.nameEn : "", tiers: data.tiers });
  useEffect(() => { onPreviewChange?.(value); }, [onPreviewChange, value]);
  useEffect(() => {
    if (!publishPreview) return;
    return () => publishQuantityPreview(null);
  }, [publishPreview]);
  useEffect(() => {
    if (!publishPreview) return;
    publishQuantityPreview({ value, standardGrades: data.standardGrades, policy: data.policy,
      buyerPriceUnit: data.buyerPriceUnit, pricePubliclyVisible: data.pricePubliclyVisible });
  }, [publishPreview, value, data]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const priceDraftChanged = JSON.stringify({ grade: value.grade, incoterm: value.incoterm, currency: value.currency, tiers: value.tiers }) !==
    JSON.stringify({ grade: data.grade, incoterm: data.incoterm, currency: data.currency, tiers: data.tiers });
  const unsent = priceDraftChanged;
  useEffect(() => {
    if (!unsent) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const confirmDiscard = () => window.confirm("Bảng giá chưa gửi. Rời trang sẽ mất nội dung. Tiếp tục?");
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      const link = target instanceof Element ? target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || event.defaultPrevented) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      if (!confirmDiscard()) event.preventDefault();
    };
    const parentForm = root.current?.closest("form");
    const onSubmit = (event: Event) => { if (!confirmDiscard()) { event.preventDefault(); event.stopPropagation(); } };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    parentForm?.addEventListener("submit", onSubmit, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
      parentForm?.removeEventListener("submit", onSubmit, true);
    };
  }, [unsent]);
  async function submit() {
    if (busy || disabled || dirty) return;
    setShowErrors(true);
    const checked = validateQuantityPricing({ ...value, nameEn: "" }, data.standardGrades, data.policy);
    if (!checked.value) { setResult({ ok: false, message: checked.errors[0]?.message ?? "Kiểm tra bảng giá." }); return; }
    if (data.pricePubliclyVisible && !consent) { setResult({ ok: false, message: "Vui lòng xác nhận cam kết giá trước khi gửi." }); return; }
    const form = new FormData();
    form.set("product_id", data.productId);
    form.set("expected_product_updated_at", data.updatedAt);
    form.set("expected_price_revision_id", data.pendingPriceId ?? "");
    form.set("grade", value.grade); form.set("incoterm", value.incoterm);
    form.set("quantity_currency", value.currency ?? "USD");
    form.set("quantity_tiers_json", JSON.stringify(value.tiers));
    if (consent) form.set("confirm_quantity_price_consent", "yes");
    setBusy(true); setResult(null);
    try {
      const response = actor === "supplier" ? await submitQuantityPriceRevisionAction(form) : await submitStaffQuantityPriceAction(form);
      setResult(response);
      if (response.ok) { setConsent(false); router.refresh(); }
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Hãy thử lại." }); }
    finally { setBusy(false); }
  }
  // Bảng giá v2 (kg/MT, đơn vị gốc) chỉ còn để đọc: form NCC không tạo hay sửa mới.
  if (data.v2) return <div ref={root} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
    <p className="font-semibold text-amber-950">{data.pendingPriceId ? "Giá mới đang chờ duyệt." : "Bảng giá đã duyệt."}</p>
    <p>Grade: <strong>{data.grade}</strong>{data.v2.customGrade ? " (tự nhập)" : ""} · Incoterm: <strong>{data.incoterm}</strong></p>
    <table className="w-full text-left text-xs"><thead><tr><th>Số lượng từ ({data.v2.unit === "mt" ? "MT" : "kg"})</th><th>Giá (USD/{data.v2.unit === "mt" ? "MT" : "kg"})</th></tr></thead>
      <tbody>{data.v2.tiers.map((tier, index) => <tr key={index} className="border-t border-amber-200"><td className="py-1 tabular-nums">{tier.quantity}</td><td className="py-1 tabular-nums">{tier.price}</td></tr>)}</tbody>
    </table>
    <p className="text-xs text-amber-900">Chưa thể sửa bảng giá này trong form hiện tại.</p>
  </div>;
  return <div ref={root} onChange={(event) => event.stopPropagation()} className="space-y-3">
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
      {data.hasApprovedPrice
        ? <>Bảng mới lưu riêng vào hàng chờ duyệt.{" "}Người mua vẫn thấy bảng giá đã duyệt; bảng đang chờ duyệt chỉ hiển thị sau khi được duyệt.</>
        : <>Bảng giá này đi cùng sản phẩm khi quản trị viên duyệt.{" "}Người mua chỉ thấy giá sau khi sản phẩm được duyệt.</>}
      {data.pendingPriceId ? " Giá mới đang chờ duyệt." : ""}
    </p>
    {actor === "supplier" && <p className="text-xs text-ink-600">Nếu thay đổi thông tin liên quan đến sản phẩm sau khi gửi giá, hãy gửi lại bảng giá trước khi gửi sản phẩm duyệt.</p>}
    {dirty && <p role="status" className="text-xs font-semibold text-amber-800">Hãy lưu hoặc hoàn tác thay đổi thông tin sản phẩm trước khi gửi bảng giá riêng.</p>}
    <QuantityPricingEditor value={value} onChange={(next) => { setValue(next); setConsent(false); }} standardGrades={data.standardGrades}
      policy={data.policy} buyerPriceUnit={data.buyerPriceUnit} pricePubliclyVisible={data.pricePubliclyVisible}
      showErrors={showErrors} disabled={disabled || dirty || busy} isolated consentChecked={consent} onConsentChange={setConsent}
      showPreview={!onPreviewChange && !publishPreview} showTitle={actor !== "supplier"} validateEnglishName={false}
      consentLabel={actor === "staff" ? "Tôi xác nhận nhà cung cấp đã cam kết giá này cho đúng grade, Incoterm và số lượng." : undefined} />
    <button type="button" disabled={disabled || dirty || busy} onClick={() => void submit()} className="btn btn-primary btn-sm">
      {busy ? "Đang gửi…" : data.hasApprovedPrice ? "Gửi bảng giá mới để duyệt" : "Gửi bảng giá để duyệt"}
    </button>
    {result && <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
  </div>;
}
