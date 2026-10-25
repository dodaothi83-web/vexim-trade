"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { saveProductEnglishAction, translateProductEnglishAction } from "./review-actions";
import { useProductEditWorkspace, useRegisterProductEditDirty } from "./edit-workspace";

type Texts = {
  name: string;
  description: string;
  spec: string;
  description_detail: string;
  packaging: string;
  certifications: string;
  moq: string;
  monthly_capacity: string;
  payment_terms: string;
  raw_material_region: string;
  input_material_origin: string;
  incoterm_place: string;
  export_port: string;
};

const FIELDS: Array<{ key: keyof Texts; label: string; rows: number; limit: number }> = [
  { key: "name", label: "Tên sản phẩm", rows: 1, limit: 180 },
  { key: "description", label: "Mô tả ngắn", rows: 4, limit: 3000 },
  { key: "spec", label: "Quy cách / tiêu chuẩn", rows: 4, limit: 1600 },
  { key: "description_detail", label: "Mô tả chi tiết", rows: 6, limit: 12000 },
  { key: "packaging", label: "Đóng gói", rows: 2, limit: 600 },
  { key: "certifications", label: "Chứng nhận", rows: 2, limit: 600 },
  { key: "moq", label: "MOQ", rows: 1, limit: 360 },
  { key: "monthly_capacity", label: "Năng lực mỗi tháng", rows: 1, limit: 360 },
  { key: "payment_terms", label: "Điều kiện thanh toán", rows: 2, limit: 400 },
  { key: "raw_material_region", label: "Vùng nguyên liệu", rows: 1, limit: 360 },
  { key: "input_material_origin", label: "Xuất xứ nguyên liệu đầu vào", rows: 2, limit: 600 },
  { key: "incoterm_place", label: "Địa điểm Incoterm", rows: 1, limit: 360 },
  { key: "export_port", label: "Cảng xuất hàng", rows: 1, limit: 360 },
];

/** Bản dịch tiếng Anh: AI hỗ trợ, nhân viên đọc lại và chốt trước khi công khai. */
export function ProductTranslationPanel({ id, source, english, hasEnglish, current, translatedAt, origin, supplierProduct = false }: {
  id: string;
  source: Texts;
  english: Texts;
  hasEnglish: boolean;
  current: boolean;
  translatedAt: string | null;
  origin: "ai" | "staff" | null;
  supplierProduct?: boolean;
}) {
  const router = useRouter();
  const { sourceDirty } = useProductEditWorkspace();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [values, setValues] = useState<Texts>(english);
  const [savedValues, setSavedValues] = useState<Texts>(english);
  const [expanded, setExpanded] = useState(!current);
  const dirty = JSON.stringify(values) !== JSON.stringify(savedValues);
  useRegisterProductEditDirty("translation", dirty);
  const englishSnapshot = JSON.stringify(english);
  const previousEnglishSnapshot = useRef(englishSnapshot);

  // Lưu hồ sơ cũng có thể kích hoạt dịch AI trên server. Đồng bộ panel sạch,
  // nhưng không ghi đè phần tiếng Anh mà nhân viên đang chỉnh dở.
  useEffect(() => {
    if (previousEnglishSnapshot.current === englishSnapshot) return;
    previousEnglishSnapshot.current = englishSnapshot;
    setValues((currentValues) => JSON.stringify(currentValues) === JSON.stringify(savedValues) ? english : currentValues);
    setSavedValues(english);
  }, [english, englishSnapshot, savedValues]);

  const visibleFields = FIELDS.filter((field) =>
    field.key === "name" || source[field.key].trim() || values[field.key].trim());

  async function translate() {
    if (busy) return;
    if (sourceDirty) {
      setResult({ ok: false, message: "Lưu nội dung gốc trước khi dịch để AI không đọc bản cũ." });
      return;
    }
    const hasDisplayedEnglish = Object.values(values).some((value) => value.trim());
    if ((hasDisplayedEnglish || dirty) && !window.confirm("Dịch lại bằng AI sẽ thay thế bản tiếng Anh hiện tại, kể cả nội dung đã chỉnh tay. Tiếp tục?")) return;
    setBusy(true); setResult(null);
    try {
      const response = await translateProductEnglishAction(id);
      setResult(response);
      if (response.ok) {
        if (response.english) {
          setValues(response.english);
          setSavedValues(response.english);
        }
        setExpanded(true);
        router.refresh();
      }
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (sourceDirty) {
      setResult({ ok: false, message: "Lưu nội dung gốc trước khi chốt bản dịch." });
      return;
    }
    if (!dirty) return;
    setBusy(true); setResult(null);
    try {
      const response = await saveProductEnglishAction(new FormData(e.currentTarget));
      setResult(response);
      if (response.ok) {
        setSavedValues(values);
        router.refresh();
      }
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }

  const status = !hasEnglish
    ? supplierProduct
      ? "Chưa có bản dịch tiếng Anh. Bản dịch không chặn việc duyệt và đăng."
      : "Chưa có bản dịch tiếng Anh. Sản phẩm chưa thể bật sẵn sàng gửi buyer."
    : current
      ? `Đã có bản dịch ${origin === "ai" ? "do AI soạn" : "do nhân viên chốt"}${translatedAt ? `, cập nhật ${new Date(translatedAt).toLocaleString("vi-VN")}` : ""}.`
      : supplierProduct
        ? "Nội dung gốc đã thay đổi. Có thể dịch lại; bản dịch không chặn việc duyệt và đăng."
        : "Nội dung gốc đã thay đổi sau lần dịch gần nhất; bản dịch có thể đã cũ, nên dịch lại trước khi công khai.";

  return <section id="product-translation" className="card scroll-mt-24 p-5" aria-label="Bản dịch tiếng Anh của sản phẩm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-ink-900">Bản dịch tiếng Anh (trang buyer)</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-600">
          {supplierProduct
            ? "AI dịch từ nội dung tiếng Việt để hỗ trợ kiểm tra. Nhân viên có thể đọc lại và dịch lại; bản dịch không chặn việc duyệt và đăng."
            : "AI dịch từ nội dung gốc tiếng Việt. Nhân viên cần đọc lại các thông số kỹ thuật trước khi công khai."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="product-translation-fields" className="btn btn-soft">
          {expanded ? "Thu gọn" : "Xem và chỉnh sửa"}
        </button>
        <button type="button" disabled={busy || sourceDirty} onClick={() => void translate()} className="btn btn-primary">
          {hasEnglish ? "Dịch lại bằng AI" : "Dịch bằng AI"}
        </button>
      </div>
    </div>
    <p role="status" className={`mt-3 text-sm ${current ? "text-emerald-700" : "font-semibold text-amber-800"}`}>{status}</p>
    {sourceDirty && <p className="mt-2 text-xs font-semibold text-amber-800">Lưu nội dung gốc trước khi dịch hoặc chốt bản tiếng Anh.</p>}
    {result && <p role="status" className={`mt-2 text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}

    <form onSubmit={(e) => void save(e)} className="mt-4">
      <input type="hidden" name="product_id" value={id} />
      <div id="product-translation-fields" hidden={!expanded}>
        <fieldset disabled={busy} className="min-w-0 space-y-4 border-0 p-0">
          {visibleFields.map((field) => (
            <div key={field.key} className="grid gap-3 lg:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-ink-600">Gốc: {field.label}</span>
                <textarea readOnly rows={field.rows} value={source[field.key]} className="input resize-y bg-ink-50 text-ink-600" aria-label={`Nội dung gốc ${field.label}`} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold text-ink-800">English: {field.label}</span>
                <textarea
                  name={`${field.key}_en`}
                  rows={field.rows}
                  maxLength={field.limit}
                  value={values[field.key]}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="input resize-y"
                  aria-label={`Bản tiếng Anh ${field.label}`}
                />
              </label>
            </div>
          ))}
        </fieldset>
      </div>
      {(expanded || dirty) && <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !dirty || sourceDirty} className="btn btn-soft">Lưu bản dịch đã chốt</button>
        {dirty && !expanded && <span className="text-xs font-semibold text-amber-800">Bản dịch đang có thay đổi chưa lưu.</span>}
      </div>}
    </form>
  </section>;
}
