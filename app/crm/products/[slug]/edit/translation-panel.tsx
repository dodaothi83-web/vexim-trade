"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveProductEnglishAction, translateProductEnglishAction } from "./review-actions";

type Texts = {
  name: string;
  description: string;
  spec: string;
  description_detail: string;
  packaging: string;
  certifications: string;
};

const FIELDS: Array<{ key: keyof Texts; label: string; rows: number; limit: number }> = [
  { key: "name", label: "Tên sản phẩm", rows: 1, limit: 180 },
  { key: "description", label: "Mô tả ngắn", rows: 4, limit: 3000 },
  { key: "spec", label: "Quy cách / tiêu chuẩn", rows: 4, limit: 1600 },
  { key: "description_detail", label: "Mô tả chi tiết", rows: 6, limit: 12000 },
  { key: "packaging", label: "Đóng gói", rows: 2, limit: 600 },
  { key: "certifications", label: "Chứng nhận", rows: 2, limit: 600 },
];

/** Bản dịch tiếng Anh của sản phẩm: AI dịch tự động, nhân viên đọc lại và chốt trước khi công khai cho buyer. */
export function ProductTranslationPanel({ id, source, english, hasEnglish, current, translatedAt, origin }: {
  id: string;
  source: Texts;
  english: Texts;
  hasEnglish: boolean;
  current: boolean;
  translatedAt: string | null;
  origin: "ai" | "staff" | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [values, setValues] = useState<Texts>(english);

  async function translate() {
    setBusy(true); setResult(null);
    try {
      const response = await translateProductEnglishAction(id);
      setResult(response);
      if (response.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setResult(null);
    try {
      const response = await saveProductEnglishAction(new FormData(e.currentTarget));
      setResult(response);
      if (response.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }

  const status = !hasEnglish
    ? "Chưa có bản dịch tiếng Anh. Sản phẩm chưa thể bật sẵn sàng gửi buyer."
    : current
      ? `Đã có bản dịch ${origin === "ai" ? "do AI soạn" : "do nhân viên chốt"}${translatedAt ? `, cập nhật ${new Date(translatedAt).toLocaleString("vi-VN")}` : ""}.`
      : "Nội dung gốc đã thay đổi sau lần dịch gần nhất; bản dịch có thể đã cũ, nên dịch lại trước khi công khai.";

  return <section className="card p-5" aria-label="Bản dịch tiếng Anh của sản phẩm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-ink-900">Bản dịch tiếng Anh (trang buyer)</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-600">
          AI dịch tự động từ nội dung gốc tiếng Việt của nhà cung cấp. Trang buyer chỉ hiển thị bản tiếng Anh;
          nhân viên cần đọc lại các thông số kỹ thuật trước khi bật sẵn sàng gửi buyer.
        </p>
      </div>
      <button type="button" disabled={busy} onClick={() => void translate()} className="btn btn-primary">
        {hasEnglish ? "Dịch lại bằng AI" : "Dịch bằng AI"}
      </button>
    </div>
    <p role="status" className={`mt-3 text-sm ${current ? "text-emerald-700" : "font-semibold text-amber-800"}`}>{status}</p>

    <form onSubmit={(e) => void save(e)} className="mt-4 space-y-4">
      <input type="hidden" name="product_id" value={id} />
      {FIELDS.map((field) => (
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
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="btn btn-soft">Lưu bản dịch đã chốt</button>
        {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
      </div>
    </form>
  </section>;
}
