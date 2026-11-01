"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { Supplier, SupplierType } from "@/lib/types";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { SUPPLIER_TYPES } from "@/lib/supplier";
import { COMPANY } from "@/lib/config";
import { COMPANY_DOCUMENT_KEYS, INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";
import { SupplierCategoryPicker } from "./supplier-category-picker";
import { FilePicker } from "@/components/file-picker";

const FILE_LABELS: Record<typeof INITIAL_DOCUMENT_KEYS[number], string> = {
  business_license: "Giấy chứng nhận đăng ký kinh doanh", food_safety: "Giấy ATTP",
  haccp_or_brc: "HACCP / ISO / FSSC / Halal", product_certs: "Chứng chỉ sản phẩm (nếu có)",
  export_license: "Giấy phép xuất khẩu (nếu áp dụng)",
};

/** Bước xác thực doanh nghiệp chỉ nhận một giấy; giấy phải đứng tên doanh nghiệp đã khai. */
const CORE_DOC_KEYS = ["business_license"] as const;

function categoriesChosen(form: HTMLFormElement): boolean {
  return form.querySelectorAll('input[name="requested_category_slugs"]').length > 0;
}

function coreDocChosen(form: HTMLFormElement): boolean {
  return CORE_DOC_KEYS.some((key) =>
    Boolean(form.querySelector<HTMLInputElement>(`input[name="doc:${key}"]`)?.files?.length));
}

const STEP_TITLES = ["Thông tin doanh nghiệp", "Giấy tờ bước đầu", "Hiển thị cho người mua & gửi hồ sơ"] as const;

/** Nhãn ngắn trong cột tiến trình bên phải; một chỉ báo duy nhất cho cả biểu mẫu. */
const PROGRESS_STEPS = ["Thông tin doanh nghiệp", "Giấy tờ", "Gửi duyệt"] as const;

/** Việc mở ra sau khi hồ sơ được duyệt, viết ngắn để đọc lướt được. */
const UNLOCK_ITEMS = [
  "Đăng sản phẩm và ảnh lên gian hàng của bạn.",
  "Nhận RFQ từ người mua và gửi báo giá.",
  "Trang doanh nghiệp công khai, có huy hiệu đã kiểm.",
  "Tải chứng nhận chất lượng cho hồ sơ.",
] as const;

export function SupplierProfileFields({ supplier, email, categories, step, accountName }: { supplier?: Supplier; email: string; categories: CategoryProposalOption[]; step: number; accountName?: string | null }) {
  const [supplierType, setSupplierType] = useState<SupplierType | "">(supplier?.supplier_type ?? "");
  const [visitRequested, setVisitRequested] = useState(false);
  const lockedType = supplier?.onboarding_status === "changes_requested";
  return <>
    <div data-step-panel={1} className={step === 1 ? "space-y-7" : "hidden"}>
    <section aria-labelledby="company-section-title"><h2 id="company-section-title" className="text-xl font-black text-ink-900">Thông tin doanh nghiệp</h2>
      <p className="mt-1 text-sm text-ink-600">Khai đúng như trên giấy tờ. {lockedType ? "Loại hình đã gửi không tự sửa tại đây." : "Chọn loại hình để hồ sơ được xếp đúng nhóm doanh nghiệp; lựa chọn này không mở thêm quyền truy cập nào."}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Tên pháp lý doanh nghiệp *" name="name" required maxLength={180} placeholder="vd: Công ty TNHH Gạch Sài Gòn" defaultValue={supplier?.name ?? ""} />
        <Field label="Tên thương mại (nếu có)" name="trade_name" maxLength={180} placeholder="vd: Gạch Sài Gòn" defaultValue={supplier?.trade_name ?? ""} />
        <label className="block text-sm"><span className="mb-1 block font-semibold">Loại hình nhà cung cấp *</span>
          {lockedType ? <>
            <input name="supplier_type" type="hidden" value={supplierType} />
            <span className="input block bg-ink-50">{SUPPLIER_TYPES.find((type) => type.value === supplierType)?.label ?? "Chưa khai"}</span>
            <span className="mt-1 block text-xs text-ink-500">Nếu sai hoặc chưa khai, liên hệ nhân viên để kiểm tra và cập nhật.</span>
          </> : <select name="supplier_type" className="input" required value={supplierType} onChange={(event) => {
            const next = event.target.value as SupplierType | "";
            setSupplierType(next);
          }}>
            <option value="" disabled>Chọn nhà máy / thương nhân / hợp tác xã</option>
            {SUPPLIER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>}
        </label>
        <Field label="Mặt hàng chính *" name="products" required maxLength={1000} placeholder="vd: Hạt điều W320, hồ tiêu đen" defaultValue={supplier?.products ?? ""} />
        <Field label="Mã số thuế (chỉ nhập số) *" name="tax_number" required maxLength={32} inputMode="numeric" pattern="[0-9]+" placeholder="vd: 0103884103" defaultValue={supplier?.tax_id ?? ""} />
        <Field label="Số tài khoản ngân hàng" name="bank_account_number" maxLength={34} inputMode="numeric" pattern="[0-9]+" placeholder="vd: 0123456789" />
        <Field label="Tỉnh / thành" name="province" maxLength={100} placeholder="vd: Hà Nội" defaultValue={supplier?.province ?? ""} />
        <Field label="Địa chỉ" name="address" maxLength={250} placeholder="vd: 25/6 Ngõ 51 Ngoạ Long, Tây Tựu" defaultValue={supplier?.address ?? ""} />
      </div>
    </section>
    <section className="border-t border-ink-200 pt-6" aria-labelledby="contact-section-title"><h2 id="contact-section-title" className="text-base font-bold text-ink-900">Người liên hệ</h2>
      <p className="mt-1 text-sm text-ink-600">Vexim gọi cho người này khi cần đối chiếu hồ sơ. Người mua chỉ thấy thông tin liên hệ sau khi hồ sơ được công khai.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Người liên hệ *" name="contact_name" required maxLength={120} placeholder="vd: Nguyễn Văn An" defaultValue={supplier?.contact_name ?? accountName ?? ""} />
        <Field label="Điện thoại *" name="phone" required maxLength={40} placeholder="vd: 0987 654 321" defaultValue={supplier?.phone ?? ""} />
        <label className="block text-sm"><span className="mb-1 block font-semibold">Email đăng nhập</span>
          <span className="input block bg-ink-50 text-ink-600">{email}</span>
          <span className="mt-1 block text-xs text-ink-500">Kết quả duyệt và mọi thông báo gửi về email này.</span>
        </label>
      </div>
    </section>
    <CategoryProposals categories={categories} supplier={supplier} />
    </div>
    <div data-step-panel={2} className={step === 2 ? "space-y-7" : "hidden"}>
    <section><h2 className="text-xl font-black text-ink-900">Giấy tờ bước đầu · Kiểm tra giấy tờ</h2>
      <p className="mt-1 text-sm text-ink-600">Chỉ cần Giấy chứng nhận đăng ký kinh doanh.<br />Giấy phải đứng tên doanh nghiệp bạn khai ở bước 1; giấy đứng tên đơn vị khác không tính.<br />Chứng nhận chất lượng (HACCP, ISO, BRC, Halal…) tải sau khi tài khoản được duyệt.<br />Mỗi tệp tối đa 15 MB; tải lên không tự duyệt.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{COMPANY_DOCUMENT_KEYS.map((key) => <FilePicker
        key={key}
        name={`doc:${key}`}
        accept=".pdf,image/jpeg,image/png,image/webp"
        title={FILE_LABELS[key]}
        required
        requiredMark
        hint="PDF, JPG, PNG hoặc WEBP, tối đa 15 MB"
      />)}</div>
    </section>
    <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">Muốn được xác minh thêm?</h2>
      <p className="mt-1 text-sm text-ink-600">Chọn nếu bạn muốn được liên hệ để kiểm tra thêm. Mỗi đánh giá được xét riêng; gửi yêu cầu không tự cấp xác minh.</p>
      <div className="mt-4 space-y-3">
        <label className="flex gap-3 rounded-xl border border-ink-200 p-4">
          <input type="checkbox" name="request:2" value="yes" checked={visitRequested} onChange={(event) => setVisitRequested(event.target.checked)} className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">{supplierType === "trading" ? "Đối chiếu nhà máy đối tác" : "Xác thực nhà máy"}</strong><small className="text-ink-600">{supplierType === "trading" ? "Cần hợp đồng với nhà máy đối tác; ảnh là tùy chọn. Nhân viên sẽ đối chiếu, không tự duyệt." : "Bạn sẽ được liên hệ để kiểm tra và tải bằng chứng theo đợt; gửi yêu cầu không tự duyệt."}</small></span>
        </label>
        <label className="flex gap-3 rounded-xl border border-ink-200 p-4">
          <input type="checkbox" name="request:3" value="yes" className="mt-1 h-4 w-4 accent-brand-700" />
          <span><strong className="block">Lịch sử giao hàng</strong><small className="text-ink-600">Bạn sẽ được liên hệ để kiểm tra và tải bằng chứng theo đợt; gửi yêu cầu không tự duyệt.</small></span>
        </label>
      </div>
    </section>
    </div>
    <div data-step-panel={3} className={step === 3 ? "space-y-7" : "hidden"}>
    <section><h2 className="text-xl font-black text-ink-900">Thông tin hiển thị trên trang doanh nghiệp</h2>
      <p className="mt-1 text-sm text-ink-600">Các trường này dựng nên trang giới thiệu doanh nghiệp.<br />Chỉ hiện công khai khi hồ sơ được xuất bản; sản phẩm và ảnh khai riêng sau khi được duyệt.<br />Cứ nhập bằng tiếng Việt: MOQ, thị trường xuất khẩu và phần giới thiệu sẽ được dịch sang tiếng Anh.</p>
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
      <label className="mt-4 block text-sm"><span className="mb-1 block font-semibold">Giới thiệu</span><textarea name="intro_source" rows={4} maxLength={1500} className="input" defaultValue={supplier?.intro_source ?? supplier?.summary_i18n?.en ?? ""} placeholder="Mô tả về điểm khác biệt của công ty hay sản phẩm của bạn." /></label>
      <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" name="private_label" value="yes" defaultChecked={supplier?.private_label ?? false} /> Nhận làm nhãn riêng / OEM</label>
    </section>
    <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-4" aria-labelledby="supplier-commitments-title">
      <h2 id="supplier-commitments-title" className="text-base font-bold text-ink-900">Xác nhận trước khi gửi hồ sơ</h2>
      <div className="mt-3 space-y-3">
        <label className="flex items-start gap-2 text-sm leading-6 text-ink-700">
          <input type="checkbox" name="consent" value="yes" required className="mt-1 h-4 w-4 shrink-0 accent-brand-700" />
          <span>Tôi đồng ý với <Link href="/dieu-khoan-su-dung" target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">Điều khoản sử dụng</Link> và cho phép dùng thông tin, tài liệu đã gửi để kiểm tra nội bộ. Tài khoản mở sau khi hồ sơ được chấp thuận.</span>
        </label>
        <label className="flex items-start gap-2 text-sm leading-6 text-ink-700">
          <input type="checkbox" name="information_accuracy" value="yes" required className="mt-1 h-4 w-4 shrink-0 accent-brand-700" />
          <span>Tôi chịu trách nhiệm về tính trung thực của thông tin đã cung cấp.<br />Thông tin gồm tên sản phẩm, giá và thời gian giao hàng; tôi cam kết thực hiện đúng.</span>
        </label>
      </div>
    </section>
    </div>
  </>;
}

function CategoryProposals({ categories, supplier }: { categories: CategoryProposalOption[]; supplier?: Supplier }) {
  return <section className="border-t border-ink-200 pt-6"><h2 className="text-base font-bold text-ink-900">Danh mục kinh doanh</h2>
    <p className="mt-1 text-sm text-ink-600">Chọn trong các danh mục đang mở.<br />Sau khi tài khoản được duyệt, sản phẩm chỉ gắn trong phạm vi này và vẫn phải duyệt trước khi công khai.</p>
    {categories.length ? <SupplierCategoryPicker categories={categories} initial={supplier?.requested_category_slugs ?? []} /> :
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Chưa có danh mục nào đang mở. Liên hệ bộ phận hỗ trợ trước khi gửi hồ sơ.</p>}
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

export function SupplierProfileForm({ supplier, email, categories, hasCoreDoc = false, accountName }: { supplier?: Supplier; email: string; categories: CategoryProposalOption[]; hasCoreDoc?: boolean; accountName?: string | null }) {
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
    if (step === 1 && !categoriesChosen(form)) {
      setStepError("Chọn ít nhất một danh mục kinh doanh ở ô phía trên.");
      return;
    }
    if (step === 2 && !hasCoreDoc && !coreDocChosen(form)) {
      setStepError("Tải Giấy chứng nhận đăng ký kinh doanh của doanh nghiệp bạn.");
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
    if (!categoriesChosen(form)) {
      setStep(1);
      setStepError("Chọn ít nhất một danh mục kinh doanh trước khi gửi hồ sơ.");
      return;
    }
    if (!hasCoreDoc && !coreDocChosen(form)) {
      setStep(2);
      setStepError("Tải Giấy chứng nhận đăng ký kinh doanh của doanh nghiệp bạn.");
      return;
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
  // Biểu mẫu chiếm khoảng hai phần ba bề ngang, cột hướng dẫn một phần ba.
  // Trần 1240px để trang rộng không kéo ô nhập dài hết tầm mắt.
  return <form ref={formRef} noValidate onSubmit={submit} className="mt-6">
    <div className="grid max-w-[1240px] items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="min-w-0 rounded-xl border border-ink-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-base font-black text-ink-900">Hoàn thành hồ sơ doanh nghiệp</p>
          <p className="hidden text-sm text-ink-500 lg:block">Bước {step}/3</p>
        </div>
        {/* Mobile: cùng một tiến trình, thu gọn thành thanh trên đầu biểu mẫu. */}
        <div className="mt-3 lg:hidden">
          <p className="text-sm text-ink-600">Bước {step}/3 · {STEP_TITLES[step - 1]}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={`Bước ${step} trên 3`}>
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
        </div>
        <div className="mt-6">
          <SupplierProfileFields supplier={supplier} email={email} accountName={accountName} categories={categories} step={step} />
        </div>
        {stepError && <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{stepError}</p>}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5">
          <button type="button" onClick={() => goToStep(step - 1)} disabled={step === 1 || busy} className="btn btn-ghost disabled:cursor-not-allowed disabled:opacity-50">Quay lại</button>
          {step < 3
            ? <button type="button" onClick={nextStep} disabled={busy} className="btn btn-primary">Tiếp tục</button>
            : <button type="submit" disabled={busy || result?.ok} className="btn btn-primary">{busy ? "Đang nộp hồ sơ..." : "Gửi hồ sơ duyệt"}</button>}
        </div>
        {result && <div role="status" className={`mt-5 rounded-xl border p-4 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
          {result.message}{result.ok && result.notification !== "sent" && <p className="mt-1">Email thông báo nội bộ có thể chưa gửi; hồ sơ vẫn nằm trong hàng chờ duyệt.</p>}
        </div>}
      </div>
      <OnboardingAside step={step} onStep={goToStep} />
    </div>
  </form>;
}

/**
 * Cột phụ bên phải: giúp doanh nghiệp đi hết biểu mẫu chứ không bán thêm gói dịch vụ.
 * Desktop bám theo khi cuộn; mobile đẩy xuống dưới biểu mẫu, riêng tiến trình đã thu gọn
 * thành thanh trên đầu nên không lặp lại hai chỉ báo bước.
 */
function OnboardingAside({ step, onStep }: { step: number; onStep: (step: number) => void }) {
  return <aside aria-label="Hướng dẫn hoàn thành hồ sơ" className="min-w-0 space-y-4 lg:sticky lg:top-20">
    <section className="hidden rounded-xl border border-brand-200 bg-brand-50/60 p-5 lg:block">
      <h2 className="text-sm font-black text-ink-900">Tiến trình hồ sơ</h2>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={`Bước ${step} trên 3`}>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(step / 3) * 100}%` }} />
      </div>
      <ol className="mt-3 space-y-1.5 text-sm">
        {PROGRESS_STEPS.map((title, index) => {
          const number = index + 1;
          const done = number < step;
          const current = number === step;
          return <li key={title} className="flex items-center gap-2">
            <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${done ? "bg-emerald-600 text-white" : current ? "bg-brand-700 text-white" : "border border-ink-300 text-ink-500"}`}>
              {done ? <Check className="h-3 w-3" /> : number}
            </span>
            {done
              ? <button type="button" onClick={() => onStep(number)} className="text-left font-semibold text-brand-700 underline">{title}</button>
              : <span className={current ? "font-bold text-ink-900" : "text-ink-500"}>{title}</span>}
            <span className="ml-auto text-xs text-ink-500">{done ? "Đã xong" : current ? "Đang điền" : "Chưa tới"}</span>
          </li>;
        })}
      </ol>
      <p className="mt-3 text-xs text-ink-600">Bấm vào bước đã xong để sửa lại.</p>
    </section>
    <section className="rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-sm font-black text-ink-900">Cần chuẩn bị gì</h2>
      <ul className="mt-3 space-y-2 text-sm text-ink-700">
        <li>Mã số thuế của doanh nghiệp.</li>
        <li>Ảnh hoặc PDF Giấy chứng nhận đăng ký kinh doanh.</li>
        <li>Số điện thoại và Zalo của người liên hệ.</li>
        <li>Tên danh mục hàng bạn muốn bán trên Vexim.</li>
      </ul>
      <p className="mt-3 text-xs text-ink-500">Giấy tờ phải đứng tên doanh nghiệp bạn khai ở bước 1.</p>
    </section>
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
      <h2 className="text-sm font-black text-ink-900">Sau khi hồ sơ được duyệt</h2>
      <ul className="mt-3 space-y-2 text-sm text-ink-700">
        {UNLOCK_ITEMS.map((item) => <li key={item} className="flex gap-2">
          <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{item}</span>
        </li>)}
      </ul>
      <p className="mt-3 text-xs text-ink-600">Duyệt hồ sơ không đồng nghĩa xác thực nhà máy hay công khai giấy tờ.</p>
    </section>
    <section className="rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-sm font-black text-ink-900">Thời gian duyệt và hỗ trợ</h2>
      <p className="mt-2 text-sm text-ink-700">Hồ sơ được xem theo thứ tự gửi đến, thường trong vài ngày làm việc.</p>
      <p className="mt-1 text-sm text-ink-700">Kết quả duyệt gửi về email đăng nhập.</p>
      <p className="mt-3 text-sm text-ink-700">Hotline: <a href={`tel:${COMPANY.phone}`} className="font-semibold text-brand-700 underline">{COMPANY.phoneDisplay}</a>.</p>
      <p className="mt-1 text-sm text-ink-700">Email: <a href={`mailto:${COMPANY.contactEmail}`} className="font-semibold text-brand-700 underline">{COMPANY.contactEmail}</a></p>
    </section>
  </aside>;
}

function Field({ label, name, required, maxLength, inputMode, pattern, defaultValue, placeholder }: {
  label: string; name: string; required?: boolean; maxLength: number; inputMode?: "numeric"; pattern?: string; defaultValue?: string; placeholder?: string;
}) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
    <input name={name} className="input" required={required} maxLength={maxLength} inputMode={inputMode} pattern={pattern} defaultValue={defaultValue} placeholder={placeholder} />
  </label>;
}
