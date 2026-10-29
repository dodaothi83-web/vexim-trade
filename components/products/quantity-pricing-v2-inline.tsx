"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QuantityPricingV2Editor } from "@/components/products/quantity-pricing-v2-editor";
import { validateSupplierQuantityEntry, type SupplierQuantityEntry } from "@/lib/products/quantity-entry";
import type { QuantityEditorData } from "@/lib/products/quantity-editor-data";
import { submitQuantityPriceRevisionAction } from "@/app/supplier/portal/quantity-revision-actions";
import { submitStaffQuantityPriceAction } from "@/app/crm/products/quantity-review/submit-actions";

/** Private staged editor for an existing v2 revision, not a public cutover. */
export function QuantityPricingV2Inline({ data, actor, disabled = false, dirty = false, onPreviewChange }: {
  data: QuantityEditorData & { v2: NonNullable<QuantityEditorData["v2"]> };
  actor: "supplier" | "staff"; disabled?: boolean; dirty?: boolean;
  onPreviewChange?: (value: SupplierQuantityEntry) => void;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<SupplierQuantityEntry>(() => ({
    grade: data.grade, incoterm: data.incoterm, nameVi: data.nameVi,
    unit: data.v2.unit, customGrade: data.v2.customGrade, tiers: data.v2.tiers,
  }));
  useEffect(() => { onPreviewChange?.(value); }, [onPreviewChange, value]);
  const [consent, setConsent] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const initial = { grade: data.grade, incoterm: data.incoterm, nameVi: data.nameVi,
    unit: data.v2.unit, customGrade: data.v2.customGrade, tiers: data.v2.tiers };
  const unsent = JSON.stringify(value) !== JSON.stringify(initial);
  useEffect(() => {
    if (!unsent) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const confirmDiscard = () => window.confirm("Bảng giá có thay đổi chưa gửi. Bạn vẫn muốn tiếp tục?");
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || event.defaultPrevented) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      if (!confirmDiscard()) event.preventDefault();
    };
    const parent = root.current?.closest("form");
    const submit = (event: Event) => { if (!confirmDiscard()) { event.preventDefault(); event.stopPropagation(); } };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    parent?.addEventListener("submit", submit, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); parent?.removeEventListener("submit", submit, true); };
  }, [unsent]);
  async function submit() {
    if (busy || disabled || dirty) return;
    setShowErrors(true);
    const checked = validateSupplierQuantityEntry(value, data.standardGrades, data.policy);
    if (!checked.value) { setResult({ ok: false, message: checked.errors[0]?.message ?? "Kiểm tra bảng giá." }); return; }
    if (data.pricePubliclyVisible && !consent) { setResult({ ok: false, message: "Vui lòng xác nhận cam kết giá trước khi gửi." }); return; }
    const form = new FormData();
    form.set("product_id", data.productId); form.set("expected_product_updated_at", data.updatedAt);
    form.set("expected_price_revision_id", data.pendingPriceId ?? "");
    form.set("quantity_version", "2"); form.set("quantity_unit", value.unit);
    form.set("quantity_custom_grade", value.customGrade ? "yes" : "no");
    form.set("grade", value.grade); form.set("incoterm", value.incoterm);
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
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">{data.pendingPriceId ? "Giá mới đang chờ Vexim xác nhận." : "Bảng giá đã duyệt. Bảng mới được gửi riêng và không thay thế giá cũ cho đến khi được duyệt."}</p>
    {dirty && <p role="status" className="text-xs font-semibold text-amber-800">Hãy lưu hoặc hoàn tác thông tin sản phẩm trước khi gửi bảng giá.</p>}
    <QuantityPricingV2Editor value={value} onChange={(next) => { if (JSON.stringify(next) !== JSON.stringify(value)) { setValue(next); setConsent(false); } }}
      standardGrades={data.standardGrades} policy={data.policy} pricePubliclyVisible={data.pricePubliclyVisible}
      consentChecked={consent} onConsentChange={setConsent} disabled={disabled || dirty || busy} showErrors={showErrors} showWarnings={actor === "staff"} isolated />
    <button type="button" disabled={disabled || dirty || busy} onClick={() => void submit()} className="btn btn-primary btn-sm">{busy ? "Đang gửi" : "Gửi bảng giá mới để duyệt"}</button>
    {result && <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
  </div>;
}
