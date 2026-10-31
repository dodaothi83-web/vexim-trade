"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";

type PreviewRow = { rowNumber: number; name: string; errors: string[]; warnings: string[] };
type ImportResponse = {
  ok: boolean;
  mode?: string;
  message?: string;
  total?: number;
  validCount?: number;
  errorCount?: number;
  rows?: PreviewRow[];
  created?: Array<{ rowNumber: number; name: string; id: string }>;
  failed?: Array<{ rowNumber: number; name: string; message: string }>;
};

export function ImportClient({ suppliers, categories }: {
  suppliers: Array<{ id: string; name: string; province: string | null }>;
  categories: Array<{ slug: string; name: string }>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ready = supplierId && category;
  const templateHref = useMemo(
    () => (category ? `/api/crm/products/import/template?category=${encodeURIComponent(category)}` : "#"),
    [category],
  );

  async function submit(mode: "preview" | "commit") {
    const file = fileRef.current?.files?.[0];
    if (!ready) { setNotice("Hãy chọn nhà cung cấp và danh mục trước."); return; }
    if (!file) { setNotice("Hãy chọn file Excel đã điền theo mẫu."); return; }
    setBusy(mode);
    setNotice(null);
    if (mode === "preview") setResult(null);
    try {
      const form = new FormData();
      form.set("supplier_id", supplierId);
      form.set("category", category);
      form.set("mode", mode);
      form.set("file", file);
      const res = await fetch("/api/crm/products/import", { method: "POST", body: form });
      const data = (await res.json()) as ImportResponse;
      if (!data.ok) { setNotice(data.message ?? "Không xử lý được file."); return; }
      setResult(data);
      if (mode === "commit") setNotice(data.message ?? "Đã nhập xong.");
    } catch {
      setNotice("Không gửi được file. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h2 className="text-sm font-bold text-ink-900">1. Chọn nhà cung cấp và danh mục</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-600">Nhà cung cấp</span>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Chọn nhà cung cấp</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.province ? ` (${s.province})` : ""}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-600">Danh mục sản phẩm</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Chọn danh mục</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={templateHref}
            aria-disabled={!category}
            className={`btn ${category ? "btn-soft" : "btn-ghost pointer-events-none opacity-50"}`}
          >
            <Download className="h-4 w-4" /> Tải file mẫu của danh mục
          </a>
          <p className="text-xs text-ink-500">File mẫu gồm trang Sản phẩm, trang Hướng dẫn và trang Ví dụ. Tối đa 200 sản phẩm mỗi file.</p>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-bold text-ink-900">2. Tải file đã điền và kiểm tra</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="btn btn-soft cursor-pointer">
            <FileSpreadsheet className="h-4 w-4" /> Chọn file .xlsx
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={() => { setResult(null); setNotice(null); }} />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => submit("preview")}>
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Kiểm tra file
          </button>
        </div>
        {notice && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
          </p>
        )}
      </section>

      {result && (
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <CheckCircle2 className="h-4 w-4 text-brand-700" />
            {result.mode === "commit" || result.created ? "Kết quả nhập file" : "Kết quả kiểm tra"}: {result.validCount ?? 0} dòng hợp lệ, {result.errorCount ?? 0} dòng lỗi, tổng {result.total ?? 0} dòng
          </h2>

          {!!result.created?.length && (
            <ul className="mt-3 space-y-1.5">
              {result.created.map((c) => (
                <li key={c.id} className="text-[13px] text-ink-700">
                  Đã tạo nháp dòng {c.rowNumber}:{" "}
                  <Link className="font-semibold text-brand-700 hover:underline" href={`/crm/products/${c.id}/edit`}>{c.name}</Link>
                </li>
              ))}
            </ul>
          )}
          {!!result.failed?.length && (
            <ul className="mt-3 space-y-1.5">
              {result.failed.map((f) => (
                <li key={f.rowNumber} className="text-[13px] font-medium text-red-700">Dòng {f.rowNumber} ({f.name}): {f.message}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                  <th className="py-2 pr-3 font-semibold">Dòng</th>
                  <th className="py-2 pr-3 font-semibold">Sản phẩm</th>
                  <th className="py-2 font-semibold">Kiểm tra</th>
                </tr>
              </thead>
              <tbody>
                {(result.rows ?? []).map((r) => (
                  <tr key={r.rowNumber} className="border-b border-ink-100 align-top">
                    <td className="py-2 pr-3 font-semibold text-ink-700">{r.rowNumber}</td>
                    <td className="py-2 pr-3 text-ink-800">{r.name}</td>
                    <td className="py-2">
                      {r.errors.length ? (
                        <ul className="space-y-0.5 font-medium text-red-700">{r.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                      ) : (
                        <span className="font-medium text-brand-700">Hợp lệ</span>
                      )}
                      {!!r.warnings.length && (
                        <ul className="mt-0.5 space-y-0.5 text-amber-700">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(result.validCount ?? 0) > 0 && result.mode !== "commit" && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => submit("commit")}>
                {busy === "commit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Nhập {result.validCount} dòng hợp lệ thành sản phẩm nháp
              </button>
              <p className="text-xs text-ink-500">Các dòng lỗi sẽ bị bỏ qua. Sản phẩm nhập vào chưa sẵn sàng gửi người mua cho tới khi bổ sung ảnh và duyệt.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
