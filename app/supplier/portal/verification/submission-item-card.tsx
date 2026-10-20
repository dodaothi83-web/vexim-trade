"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Camera, FileText, Loader2, MapPin, ShieldAlert, Sparkles, Trash2 } from "lucide-react";

import type { PortalItemSpec, PortalItemView } from "@/lib/supplier-portal/submission-view";
import { deleteSubmissionItemAction } from "./submission-actions";

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }) : null;
}

/**
 * Một ô bằng chứng: chụp/tải ẢNH GỐC, xem EXIF + GPS + cờ đối chứng + nhận xét AI.
 * Ảnh gửi lên nguyên bản (không nén ở trình duyệt) để hệ thống còn EXIF mà kiểm tra.
 */
export function SubmissionItemCard({ spec, level, rows, submissionId, editable, gps, codeIssued, onChanged }: {
  spec: PortalItemSpec;
  level: 2 | 3;
  rows: PortalItemView[];
  submissionId: string;
  editable: boolean;
  gps: { lat: number | null; lng: number | null; accuracy: number | null; at: string | null };
  codeIssued: boolean;
  onChanged: (message: string, ok: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = rows[0] ?? null;
  const needsCode = level === 2 && spec.requiresCode;
  const accept = level === 2 ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf";

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    if (needsCode && !codeIssued) {
      const message = "Mục này cần tờ giấy viết tay mã xác minh. Hãy bấm “Tạo mã xác minh”, in hoặc chép tay mã lên giấy rồi chụp cùng.";
      setError(message);
      onChanged(message, false);
      return;
    }
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("checklistKey", spec.key);
      form.set("file", file, file.name);
      if (gps.lat != null) form.set("lat", String(gps.lat));
      if (gps.lng != null) form.set("lng", String(gps.lng));
      if (gps.accuracy != null) form.set("accuracy", String(gps.accuracy));
      form.set("capturedAt", gps.at ?? new Date(file.lastModified || Date.now()).toISOString());
      const response = await fetch(`/api/supplier-portal/submissions/${encodeURIComponent(submissionId)}/upload`, { method: "POST", body: form });
      const data = await response.json() as { ok?: boolean; message?: string };
      const message = data.message ?? (response.ok ? "Đã tải bằng chứng." : "Không tải lên được.");
      if (!response.ok || !data.ok) setError(message);
      onChanged(message, Boolean(response.ok && data.ok));
    } catch {
      const message = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
      setError(message);
      onChanged(message, false);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: PortalItemView) {
    if (!editable || busy) return;
    if (!window.confirm(`Xóa hẳn bằng chứng của mục “${spec.label}”? Tệp gốc cũng bị xóa khỏi kho.`)) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("submission_id", submissionId);
      form.set("item_id", row.id);
      const result = await deleteSubmissionItemAction(form);
      setError(result.ok ? null : result.message);
      onChanged(result.message, result.ok);
    } catch {
      onChanged("Không xóa được bằng chứng.", false);
    } finally {
      setBusy(false);
    }
  }

  return <article className={`rounded-xl border bg-white p-3.5 ${needsCode ? "border-teal-300" : "border-slate-200"}`}>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-900">
          {spec.order}. {spec.label}{" "}
          {needsCode && <span title="Phải có tờ giấy viết tay mã xác minh trong khung hình">🔖</span>}
        </h3>
        <p className="mt-0.5 text-xs text-slate-600">{spec.requirement ?? (spec.required ? "Mục bắt buộc" : "Nếu có")}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${latest ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        {latest ? "Đã có bằng chứng" : spec.required ? "Chưa có" : "Chưa có (tùy chọn)"}
      </span>
    </header>

    {rows.length > 0 && <div className="mt-3 flex flex-wrap gap-3">
      {rows.map((row) => <figure key={row.id} className="w-28 shrink-0">
        {row.thumbHref
          ? <a href={row.href} target="_blank" rel="noreferrer">
              {/* Ảnh bằng chứng phải mở qua route có kiểm tra quyền, không qua next/image công khai. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.thumbHref} alt={row.label} className="h-20 w-28 rounded-lg border border-slate-200 object-cover" />
            </a>
          : <a href={row.href} target="_blank" rel="noreferrer" className="flex h-20 w-28 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500"><FileText className="size-6" /></a>}
        <figcaption className="mt-1 flex items-center justify-between gap-1 text-[11px] text-slate-500">
          <a href={row.href} target="_blank" rel="noreferrer" className="font-semibold text-teal-800 underline">{row.isPdf ? "Mở PDF" : "Mở ảnh gốc"}</a>
          {editable && <button type="button" onClick={() => void remove(row)} className="text-rose-600 hover:underline" aria-label={`Xóa bằng chứng ${row.label}`}><Trash2 className="size-3.5" /></button>}
        </figcaption>
      </figure>)}
    </div>}

    {latest && <div className="mt-2.5 text-[11px] text-slate-600">
      {/* Dòng tóm tắt 1 chạm: EXIF còn/mất + GPS + giờ chụp. Chi tiết đầy đủ thu gọn bên dưới. */}
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
        <span className={latest.hasExif ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{latest.hasExif ? "EXIF còn (ảnh gốc)" : "EXIF MẤT — nghi qua Zalo/Facebook"}</span>
        <span className="inline-flex items-center gap-0.5"><MapPin className="size-3 shrink-0 text-slate-400" />
          {latest.exifLat != null && latest.exifLng != null ? `${latest.exifLat.toFixed(4)}, ${latest.exifLng.toFixed(4)}` : "không có GPS"}</span>
        {latest.exifCapturedLabel && <span>Chụp lúc {latest.exifCapturedLabel}</span>}
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer font-semibold text-slate-500 hover:text-slate-700">Chi tiết EXIF/GPS</summary>
        <dl className="mt-1.5 grid gap-1 sm:grid-cols-2">
          <div><span>Giờ chụp theo EXIF: {latest.exifCapturedLabel ?? "không rõ"}</span></div>
          <div><span>Tải lên lúc: {when(latest.uploadedAt)}</span></div>
          {latest.exifLat != null && latest.exifLng != null && <div><span>GPS trong ảnh: {latest.exifLat.toFixed(5)}, {latest.exifLng.toFixed(5)}</span></div>}
          {latest.camera && <div><span>Thiết bị: {latest.camera}</span></div>}
          {latest.software && <div><span>Phần mềm ghi tệp: {latest.software}</span></div>}
          {latest.width != null && <div><span>{latest.width}×{latest.height}px · {Math.round((latest.bytes ?? 0) / 1024)} KB</span></div>}
          {latest.captureLat != null && <div><span>Vị trí trình duyệt: {latest.captureLat.toFixed(5)}, {latest.captureLng?.toFixed(5)}{latest.captureAccuracy != null ? ` (±${Math.round(latest.captureAccuracy)} m)` : ""}</span></div>}
        </dl>
      </details>
    </div>}

    {(latest?.flags.length ?? 0) > 0 && <ul className="mt-3 space-y-1">
      {latest!.flags.map((flag) => <li key={flag.flag} className={`flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] ${flag.severity === "hard" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>
        {flag.severity === "hard" ? <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
        <span><strong>{flag.label}.</strong> {flag.detail ?? ""}</span>
      </li>)}
    </ul>}

    {latest?.aiVerdict && <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-700">
      <p className="flex items-center gap-1 font-bold"><Sparkles className="size-3.5 text-violet-600" />
        AI: {latest.aiVerdict === "pass" ? "đúng mục yêu cầu" : latest.aiVerdict === "fail" ? "không đạt" : "chưa đủ cơ sở"}
      </p>
      {latest.aiReason && <p className="mt-1">{latest.aiReason}</p>}
      {latest.aiDetectedText && <p className="mt-1 text-slate-600">Chữ đọc được: “{latest.aiDetectedText}”</p>}
      {(latest.aiCodeRead || latest.aiCodeVisible === false) && <p className="mt-1 text-slate-600">
        Mã viết tay: {latest.aiCodeVisible === false ? "không thấy tờ giấy trong ảnh" : `AI đọc được “${latest.aiCodeRead}”`}
      </p>}
      <p className="mt-1 text-[10px] text-slate-500">AI chỉ gợi ý; kết quả xác minh do nhân viên Vexim quyết định.</p>
    </div>}

    {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p>}

    <input ref={inputRef} type="file" accept={accept} capture={level === 2 ? "environment" : undefined} className="hidden" onChange={(e) => void onPick(e)} />
    <button type="button" disabled={!editable || busy} onClick={() => inputRef.current?.click()}
      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
      {busy ? "Đang tải..." : rows.length ? "Chụp/tải bản mới" : level === 2 ? "Chụp ảnh tại nhà máy" : "Tải chứng từ"}
    </button>
    {!editable && <p className="mt-1 text-[11px] text-slate-500">Hồ sơ đang chờ xét duyệt hoặc đã được nhận nên bằng chứng bị khóa.</p>}
  </article>;
}
