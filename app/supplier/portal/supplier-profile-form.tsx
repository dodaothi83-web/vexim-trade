"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Supplier, SupplierType } from "@/lib/types";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { SUPPLIER_TYPES } from "@/lib/supplier";
import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { SupplierCategoryPicker } from "./supplier-category-picker";

const FILE_LABELS: Record<typeof INITIAL_DOCUMENT_KEYS[number], string> = {
  business_license: "Đăng ký doanh nghiệp", food_safety: "Giấy ATTP (nếu có)",
  haccp_or_brc: "HACCP/BRC/ISO (nếu có)", product_certs: "Chứng chỉ sản phẩm (nếu có)",
  export_license: "Giấy phép xuất khẩu (nếu áp dụng)",
};

const STEP_TITLES = ["Thông tin doanh nghiệp", "Giấy tờ bước đầu", "Hiển thị cho buyer & gửi hồ sơ"] as const;

export function SupplierProfileFields({ supplier, email, categories, step }: { supplier?: Supplier; email: string; categories: CategoryProposalOption[]; step: number }) {
  const [supplierType, setSupplierType] = useState<SupplierType | "">(supplier?.supplier_type ?? "");
  const [visitRequested, setVisitRequested] = useState(false);
  const visitLocked = supplierType === "trading";
  return <>
    <div data-step-panel={1} className={step === 1 ? "space-y-7" : "hidden"}>
    <section><h2 className="text-xl font-black text-ink-900">Thông tin doanh nghiệp</h2>
      <p className="mt-1 text-sm text-ink-600">Email đăng nhập: {email}. Chọn loại hình để Vexim hiểu đúng doanh nghiệp của bạn; đây không phải quyền truy cập CRM.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tên pháp lý doanh nghiệp *" name="name" required maxLength={180} defaultValue={supplier?.name ?? ""} />
        <Field label="Tên thương mại (nếu có)" name="trade_name" maxLength={180} defaultValue={supplier?.trade_name ?? ""} />
        <label className="block text-sm"><span className="mb-1 block font-semibold">Loại hình nhà cung cấp *</span>
          <select name="supplier_type" className="input" required value={supplierType} onChange={(event) => {
            const next = event.target.value as SupplierType | "";
            setSupplierType(next);
            if (next === "trading") setVisitRequested(false);
          }}>
            <option value="" disabled>Chọn nhà máy / thương nhân / hợp tác xã</option>
            {SUPPLIER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </label>
        <Field label="Mặt hàng chính *" name="products" required maxLength={1000} defaultValue={supplier?.products ?? ""} />
        <Field label="Tỉnh / thành" name="province" maxLength={100} defaultValue={supplier?.province ?? ""} />
        <Field label="Địa chỉ" name="address" maxLength={250} defaultValue={supplier?.address ?? ""} />
        <Field label="Người liên hệ *" name="contact_name" required maxLength={120} defaultValue={supplier?.contact_name ?? ""} />
        <Field label="Điện thoại *" name="phone" required maxLength={40} defaultValue={supplier?.phone ?? ""} />
        <Field label="Mã số thuế (chỉ nhập số) *" name="tax_number" required maxLength={32} inputMode="numeric" pattern="[0-9]+" defaultValue={supplier?.tax_id ?? ""} />
        <Field label="Số tài khoản ngân hàng" name="bank_account_number" maxLength={34} inputMode="numeric" pattern="[0-9]+" />
      </div>
    </section>
    <CategoryProposals categories={categories} supplier={supplier} />
    </div>
    <div data-step-panel={2} className={step === 2 ? "space-y-7" : "hidden"}>
    <section><h2 className="text-xl font-black text-ink-900">Giấy tờ bước đầu · Kiểm tra giấy tờ</h2>
      <p className="mt-1 text-sm text-ink-600">Ảnh/PDF tối đa 15 MB/tệp, tổng tối đa 5 tệp. ATTP, HACCP không bắt buộc với thương nhân. Tải lên không tự duyệt.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{INITIAL_DOCUMENT_KEYS.map((key) =>
        <label key={key} className="block text-sm"><span className="mb-1 block font-semibold">{FILE_LABELS[key]}</span>
          <input type="file" name={`doc:${key}`} accept=".pdf,image/jpeg,image/png,image/webp" className="input" /></label>)}</div>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">Muốn Vexim xác minh thêm?</h2>
      <p className="mt-1 text-sm text-ink-600">Chọn yêu cầu chỉ để Vexim liên hệ. Mỗi đánh giá được duyệt riêng; thương nhân vẫn có thể yêu cầu kiểm tra lịch sử giao hàng.</p>
      <div className="mt-4 space-y-3">
        <label className={`flex gap-3 rounded-xl border p-4 ${visitLocked ? "cursor-not-allowed border-ink-200 bg-ink-50 text-ink-400" : "border-ink-200"}`}>
          <input type="checkbox" name="request:2" value="yes" checked={visitRequested} onChange={(event) => setVisitRequested(event.target.checked)} disabled={visitLocked} className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">Thăm nhà máy</strong><small className={visitLocked ? "text-ink-500" : "text-ink-600"}>{visitLocked ? "Không áp dụng cho thương nhân trên form đăng ký. Vexim có thể xem xét riêng nếu cần." : "Vexim sẽ liên hệ để kiểm tra và tải bằng chứng theo đúng đợt, không tự duyệt."}</small></span>
        </label>
        <label className="flex gap-3 rounded-xl border border-ink-200 p-4">
          <input type="checkbox" name="request:3" value="yes" className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">Lịch sử giao hàng</strong><small className="text-ink-600">Vexim sẽ liên hệ để kiểm tra và tải bằng chứng theo đúng đợt, không tự duyệt.</small></span>
        </label>
      </div>
    </section>
    </div>
    <div data-step-panel={3} className={step === 3 ? "space-y-7" : "hidden"}>
    <section><h2 className="text-xl font-black text-ink-900">Thông tin hiển thị trên trang NCC</h2>
      <p className="mt-1 text-sm text-ink-600">Các trường bổ sung giúp Vexim xây trang nhà cung cấp. Chỉ xuất hiện công khai khi Vexim quyết định xuất bản hồ sơ; sản phẩm/ảnh sản phẩm khai riêng sau khi tài khoản được duyệt. Bạn cứ nhập bằng tiếng Việt, các nội dung hiển thị cho buyer nước ngoài như MOQ, thị trường xuất khẩu và phần giới thiệu công ty sẽ được dịch tự động sang tiếng Anh khi Vexim kiểm tra hồ sơ.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tên hiển thị trên trang" name="display_name" maxLength={180} defaultValue={supplier?.display_name ?? ""} />
        <Field label="Website (https://...)" name="website" maxLength={250} defaultValue={supplier?.website ?? ""} />
        <Field label="Quốc gia" name="country" maxLength={100} defaultValue={supplier?.country ?? "Vietnam"} />
        <Field label="Chức vụ người liên hệ" name="contact_title" maxLength={100} defaultValue={supplier?.contact_title ?? ""} />
        <Field label="Zalo" name="zalo" maxLength={40} defaultValue={supplier?.zalo ?? ""} />
        <Field label="Năm thành lập" name="founded_year" maxLength={4} inputMode="numeric" defaultValue={String(supplier?.founded_year ?? "")} />
        <Field label="Số nhân viên" name="employees" maxLength={8} inputMode="numeric" defaultValue={String(supplier?.employees ?? "")} />
        <Field label="Công suất mỗi tháng" name="capacity_per_month" maxLength={180} defaultValue={supplier?.capacity_per_month ?? ""} />
        <Field label="MOQ" name="moq_text" maxLength={180} defaultValue={supplier?.moq_text ?? ""} />
        <Field label="Lead time (ngày)" name="lead_time_days" maxLength={5} inputMode="numeric" defaultValue={String(supplier?.lead_time_days ?? "")} />
        <Field label="Thị trường đã phục vụ" name="markets" maxLength={800} defaultValue={supplier?.markets ?? ""} />
        <Field label="Thị trường xuất khẩu (ngăn cách bằng dấu phẩy)" name="export_markets" maxLength={800} defaultValue={supplier?.export_markets?.join(", ") ?? ""} />
        <Field label="Cảng xuất (ngăn cách bằng dấu phẩy)" name="ports" maxLength={800} defaultValue={supplier?.ports?.join(", ") ?? ""} />
        <Field label="Incoterms (ngăn cách bằng dấu phẩy)" name="incoterms" maxLength={800} defaultValue={supplier?.incoterms?.join(", ") ?? ""} />
        <Field label="Điều khoản thanh toán" name="payment_terms" maxLength={200} defaultValue={supplier?.payment_terms ?? ""} />
      </div>
      <label className="mt-4 block text-sm"><span className="mb-1 block font-semibold">Giới thiệu</span><textarea name="intro_source" rows={4} maxLength={1500} className="input" defaultValue={supplier?.intro_source ?? supplier?.summary_i18n?.en ?? ""} placeholder="Mô tả về điểm khác biệt của công ty hay sản phẩm của bạn." /><span className="mt-1 block text-xs leading-5 text-ink-500">Đây là phần bạn kể câu chuyện của công ty mình cho buyer. Cứ viết bằng tiếng Việt, Vexim sẽ dịch sang tiếng Anh bằng AI để hiển thị trên trang nhà cung cấp. Để trống thì Vexim soạn bản giới thiệu ngắn từ thông tin bạn đã cung cấp ở trên.</span></label>
      <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" name="private_label" value="yes" defaultChecked={supplier?.private_label ?? false} /> Nhận làm nhãn riêng / OEM</label>
    </section>
    <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-4" aria-labelledby="supplier-commitments-title">
      <h2 id="supplier-commitments-title" className="text-base font-bold text-ink-900">Xác nhận trước khi gửi hồ sơ</h2>
      <div className="mt-3 space-y-3">
        <label className="flex items-start gap-2 text-sm leading-6 text-ink-700">
          <input type="checkbox" name="consent" value="yes" required className="mt-1 h-4 w-4 shrink-0 accent-brand-700" />
          <span>Tôi đã đọc và đồng ý với <Link href="/dieu-khoan-su-dung" target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">Điều khoản sử dụng</Link> của Vexim Trade, đồng thời đồng ý gửi thông tin và tài liệu để Vexim kiểm tra nội bộ. Tài khoản chỉ hoạt động sau khi Vexim xác nhận.</span>
        </label>
        <label className="flex items-start gap-2 text-sm leading-6 text-ink-700">
          <input type="checkbox" name="information_accuracy" value="yes" required className="mt-1 h-4 w-4 shrink-0 accent-brand-700" />
          <span>Tôi chịu trách nhiệm về tính trung thực của thông tin đã cung cấp, gồm tên sản phẩm, giá sản phẩm và thời gian giao hàng, và cam kết thực hiện đúng với những thông tin này.</span>
        </label>
      </div>
    </section>
    </div>
  </>;
}

function CategoryProposals({ categories, supplier }: { categories: CategoryProposalOption[]; supplier?: Supplier }) {
  return <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">Danh mục kinh doanh</h2>
    <p className="mt-1 text-sm text-ink-600">Chọn các danh mục Vexim đã mở. Sau khi tài khoản được duyệt, bạn chỉ có thể thêm sản phẩm thuộc các danh mục đã chọn; Vexim vẫn kiểm tra từng sản phẩm trước khi công khai.</p>
    {categories.length ? <SupplierCategoryPicker categories={categories} initial={supplier?.requested_category_slugs ?? []} /> :
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Vexim chưa mở danh mục kinh doanh. Vui lòng liên hệ Vexim trước khi gửi hồ sơ.</p>}
  </section>;
}

/** First invalid (enabled, non-hidden) field inside one wizard step panel, if any. */
function firstInvalidField(form: HTMLFormElement, step: number): HTMLElement | null {
  const panel = form.querySelector(`[data-step-panel="${step}"]`);
  if (!panel) return null;
  for (const el of panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")) {
    if (el.disabled || (el instanceof HTMLInputElement && el.type === "hidden")) continue;
    if (!el.checkValidity()) return el;
  }
  return null;
}

export function SupplierProfileForm({ supplier, email, categories }: { supplier?: Supplier; email: string; categories: CategoryProposalOption[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(1);
  const [stepError, setStepError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; notification?: string } | null>(null);

  function goToStep(next: number) {
    setStep(next);
    setStepError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function nextStep() {
    const form = formRef.current;
    if (!form) return;
    const bad = firstInvalidField(form, step);
    if (bad) {
      setStepError("Còn trường bắt buộc chưa điền hoặc chưa đúng định dạng ở bước này. Vui lòng kiểm tra lại.");
      bad.focus();
      bad.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    goToStep(step + 1);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    // Panels of other steps are hidden, so native validation cannot surface
    // their errors; walk the steps ourselves and jump to the first problem.
    for (const s of [1, 2, 3]) {
      const bad = firstInvalidField(form, s);
      if (bad) {
        setStep(s);
        const fieldName = (bad as HTMLInputElement).name;
        setStepError(s === 3 && fieldName === "consent"
          ? "Vui lòng tích ô đồng ý với Điều khoản sử dụng trước khi gửi hồ sơ."
          : s === 3 && fieldName === "information_accuracy"
            ? "Vui lòng tích ô chịu trách nhiệm về tính trung thực của tên, giá sản phẩm và thời gian giao hàng."
            : "Còn trường bắt buộc chưa điền hoặc chưa đúng định dạng. Vui lòng kiểm tra lại bước này.");
        window.setTimeout(() => { bad.focus(); bad.scrollIntoView({ block: "center", behavior: "smooth" }); }, 50);
        return;
      }
    }
    setStepError(null);
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/supplier-portal/profile", { method: "POST", body: new FormData(form) });
      const data = await response.json() as { ok: boolean; message: string; notification?: string };
      setResult(data);
      if (data.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ. Vui lòng thử lại." }); }
    finally { setBusy(false); }
  }
  return <form ref={formRef} noValidate onSubmit={submit} className="mt-6 space-y-7 rounded-xl border border-ink-200 bg-white p-5 sm:p-7">
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-ink-900">Hoàn thành hồ sơ doanh nghiệp</p>
        <p className="text-sm text-ink-500">Bước {step}/3 · {STEP_TITLES[step - 1]}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={`Bước ${step} trên 3`}>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
      </div>
    </div>
    <SupplierProfileFields supplier={supplier} email={email} categories={categories} step={step} />
    {stepError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{stepError}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5">
      <button type="button" onClick={() => goToStep(step - 1)} disabled={step === 1 || busy} className="btn btn-ghost disabled:cursor-not-allowed disabled:opacity-50">← Quay lại</button>
      {step < 3
        ? <button type="button" onClick={nextStep} disabled={busy} className="btn btn-primary">Tiếp tục →</button>
        : <button type="submit" disabled={busy || result?.ok} className="btn btn-primary">{busy ? "Đang nộp hồ sơ..." : "Gửi hồ sơ cho Vexim xác nhận"}</button>}
    </div>
    {result && <div role="status" className={`rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
      {result.message}{result.ok && result.notification !== "sent" && <p className="mt-1">Email nội bộ có thể chưa gửi; hồ sơ vẫn ở hàng chờ Vexim.</p>}
    </div>}
  </form>;
}

function Field({ label, name, required, maxLength, inputMode, pattern, defaultValue }: {
  label: string; name: string; required?: boolean; maxLength: number; inputMode?: "numeric"; pattern?: string; defaultValue?: string;
}) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
    <input name={name} className="input" required={required} maxLength={maxLength} inputMode={inputMode} pattern={pattern} defaultValue={defaultValue} />
  </label>;
}
