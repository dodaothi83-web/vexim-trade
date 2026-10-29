"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuantityPricingEditor } from "@/components/products/quantity-pricing-editor";
import { validateQuantityPricing, type QuantityPricingInput } from "@/lib/products/quantity-pricing";
import type { QuantityEditorData } from "@/lib/products/quantity-editor-data";
import { submitEnglishNameRevisionAction, submitQuantityPriceRevisionAction } from "@/app/supplier/portal/quantity-revision-actions";
import { submitStaffQuantityPriceAction } from "@/app/crm/products/quantity-review/submit-actions";

/** Independent revision submission inside an existing product form; never mutates legacy price fields. */
export function QuantityPricingInline({ data, actor, disabled = false, dirty = false }: {
  data: QuantityEditorData; actor: "staff" | "supplier"; disabled?: boolean; dirty?: boolean;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<QuantityPricingInput>({ grade: data.grade, incoterm: data.incoterm, nameVi: data.nameVi,
    nameEn: actor === "supplier" ? data.nameEn : "", tiers: data.tiers });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const priceDraftChanged = JSON.stringify({ grade: value.grade, incoterm: value.incoterm, tiers: value.tiers }) !==
    JSON.stringify({ grade: data.grade, incoterm: data.incoterm, tiers: data.tiers });
  const unsent = priceDraftChanged || (actor === "supplier" && value.nameEn !== data.nameEn);
  useEffect(() => {
    if (!unsent) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const confirmDiscard = () => window.confirm("Bảng giá hoặc tên tiếng Anh có thay đổi chưa gửi. Tiếp tục có thể làm mất nội dung này. Bạn vẫn muốn tiếp tục?");
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
  async function submitName() {
    if (busy || disabled || dirty || priceDraftChanged || !value.nameEn.trim()) return;
    const form = new FormData();
    form.set("product_id", data.productId);
    form.set("expected_product_updated_at", data.updatedAt);
    form.set("expected_name_revision_id", data.pendingNameId ?? "");
    form.set("name_en", value.nameEn);
    setBusy(true); setResult(null);
    try {
      const response = await submitEnglishNameRevisionAction(form);
      setResult(response);
      if (response.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Hãy thử lại." }); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (busy || disabled || dirty) return;
    setShowErrors(true);
    const checked = validateQuantityPricing(value, data.standardGrades, data.policy);
    if (!checked.value) { setResult({ ok: false, message: checked.errors[0]?.message ?? "Kiểm tra bảng giá." }); return; }
    if (data.pricePubliclyVisible && !consent) { setResult({ ok: false, message: "Vui lòng xác nhận cam kết giá trước khi gửi." }); return; }
    const form = new FormData();
    form.set("product_id", data.productId);
    form.set("expected_product_updated_at", data.updatedAt);
    form.set("expected_price_revision_id", data.pendingPriceId ?? "");
    form.set("grade", value.grade); form.set("incoterm", value.incoterm); form.set("name_en", value.nameEn);
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
  return <div ref={root} onChange={(event) => event.stopPropagation()} className="space-y-3">
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
      Bảng mới lưu riêng vào hàng chờ duyệt.{" "}
      {data.buyerPreviewEnabled ? "Môi trường thử nghiệm có thể hiển thị bảng mới đã duyệt; bản chờ không thay thế bản đã duyệt." : "Giá đang hiển thị cho buyer vẫn dùng bảng cũ; phần hiển thị buyer theo mô hình mới chưa được triển khai công khai."}
      {data.pendingPriceId ? " Giá mới đang chờ Vexim xác nhận." : data.hasApprovedPrice ? " Đã có bảng giá mới được duyệt." : " Chưa có bảng giá mới được duyệt."}
    </p>
    {dirty && <p role="status" className="text-xs font-semibold text-amber-800">Hãy lưu hoặc hoàn tác thay đổi thông tin sản phẩm trước khi gửi bảng giá riêng.</p>}
    {actor === "supplier" && <div className="rounded-lg border border-ink-200 p-3">
      <label className="block text-sm font-semibold">Tên tiếng Anh (tùy chọn)
        <input form="quantity-pricing-separate" className="input mt-1 w-full" maxLength={180} value={value.nameEn}
          disabled={disabled || dirty || busy} onChange={(event) => { setValue({ ...value, nameEn: event.target.value }); setConsent(false); }} />
      </label>
      <p className="mt-1 text-xs text-ink-500">Không ghi grade trong tên. Tên được gửi duyệt riêng; dịch tự động chưa được nối.</p>
      <p className="mt-1 text-xs text-ink-600">{data.pendingNameId ? "Tên tiếng Anh mới đang chờ duyệt." : data.hasApprovedName ? "Đã có tên tiếng Anh được duyệt trong mô hình mới." : "Chưa có tên tiếng Anh được duyệt trong mô hình mới."}</p>
      {priceDraftChanged && <p className="mt-1 text-xs text-amber-800">Gửi bảng giá đang sửa trước khi gửi tên để tránh mất nội dung chưa lưu.</p>}
      <button type="button" disabled={disabled || dirty || busy || priceDraftChanged || !value.nameEn.trim()} onClick={() => void submitName()}
        className="btn btn-soft btn-sm mt-2">Gửi tên tiếng Anh để duyệt</button>
    </div>}
    <QuantityPricingEditor value={value} onChange={(next) => { setValue(next); setConsent(false); }} standardGrades={data.standardGrades}
      policy={data.policy} buyerPriceUnit={data.buyerPriceUnit} pricePubliclyVisible={data.pricePubliclyVisible}
      showErrors={showErrors} disabled={disabled || dirty || busy} isolated consentChecked={consent} onConsentChange={setConsent}
      consentLabel={actor === "staff" ? "Tôi xác nhận đã nhận cam kết của NCC rằng đây là giá NCC sẵn sàng báo cho buyer với đúng grade, Incoterm và số lượng đã ghi." : undefined} />
    <button type="button" disabled={disabled || dirty || busy} onClick={() => void submit()} className="btn btn-primary btn-sm">
      {busy ? "Đang gửi…" : "Gửi bảng giá mới để duyệt"}
    </button>
    {result && <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
  </div>;
}
