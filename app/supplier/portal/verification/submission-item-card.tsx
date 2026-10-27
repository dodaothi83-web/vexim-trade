"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Camera, FileText, Image, Loader2, MapPin, ShieldAlert, Sparkles, Trash2 } from "lucide-react";

import type { PortalItemSpec, PortalItemView } from "@/lib/supplier-portal/submission-view";
import { MAX_ITEMS_PER_KEY } from "@/lib/verification-submission";
import { deleteSubmissionItemAction } from "./submission-actions";

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }) : null;
}

/**
 * Một ô bằng chứng, dựng như thẻ sản phẩm của sàn TMĐT: ảnh thu nhỏ ở trên, tên mục và
 * trạng thái ở dưới, nút tải ngay trong thẻ. Chi tiết kỹ thuật (EXIF, GPS, cờ, nhận xét
 * AI) thu gọn để lưới 9 ảnh vẫn gọn, nhưng không mất thông tin nào.
 *
 * Từ 21/10/2026 ảnh chụp bằng điện thoại là đủ, không bắt buộc ảnh gốc: người dùng có
 * thể chọn ảnh từ thư viện, kể cả ảnh đã gửi qua Zalo. Điều bắt buộc duy nhất là 3 mục
 * 🔖 phải có tờ mã xác minh trong khung hình.
 */
export function SubmissionItemCard({ spec, level, partner = false, rows, submissionId, editable, paused, gps, codeIssued, onChanged, onBusyChange }: {
  spec: PortalItemSpec;
  level: 2 | 3;
  partner?: boolean;
  rows: PortalItemView[];
  submissionId: string;
  editable: boolean;
  paused: boolean;
  gps: { lat: number | null; lng: number | null; accuracy: number | null; at: string | null };
  codeIssued: boolean;
  onChanged: (message: string, ok: boolean) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = rows[0] ?? null;
  const needsCode = level === 2 && spec.requiresCode;
  const full = (level === 3 || partner) && rows.length >= MAX_ITEMS_PER_KEY;
  // Only a system code gate requires a fix; historic AI/technical flags are notes.
  const requiresFix = (flag: PortalItemView["flags"][number]) => needsCode && flag.source !== "ai" && flag.severity === "hard" && (flag.flag === "code_missing" || flag.flag === "code_mismatch");
  const hardFlags = latest?.flags.filter(requiresFix) ?? [];
  const softFlags = latest?.flags.filter((flag) => !requiresFix(flag)) ?? [];
  const accept = level === 3 || (partner && spec.key === "partner_factory_contract") ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp";

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy || paused || !editable || full) return;
    if (needsCode && !codeIssued) {
      const message = "Mục này cần tờ mã xác minh. Hãy bấm “Tạo mã xác minh”, tải tờ mã về, in ra giấy rồi chụp cùng cảnh.";
      setError(message);
      onChanged(message, false);
      return;
    }
    setBusy(true); onBusyChange(true); setError(null);
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
      setBusy(false); onBusyChange(false);
    }
  }

  async function remove(row: PortalItemView, index: number) {
    if (!editable || busy || paused) return;
    if (!window.confirm(`Xóa tệp ${index + 1} của mục “${spec.label}”? Tệp gốc cũng bị xóa khỏi kho.`)) return;
    setBusy(true); onBusyChange(true);
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
      setBusy(false); onBusyChange(false);
    }
  }

  return <article className={`group flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md ${needsCode ? "border-brand-200" : "border-ink-200"}`}>
    {/* Ảnh thu nhỏ: bấm vào mở tệp gốc qua route có kiểm tra quyền. */}
    <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-ink-100">
      {latest
        ? (latest.thumbHref
          ? <a href={latest.href} target="_blank" rel="noreferrer" className="block h-full w-full" aria-label={`Mở ảnh gốc của mục ${spec.label}`}>
              {/* Ảnh bằng chứng phải mở qua route có kiểm tra quyền, không qua next/image công khai. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={latest.thumbHref} alt={latest.label} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
            </a>
          : <a href={latest.href} target="_blank" rel="noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-1 bg-ink-50 text-ink-500">
              <FileText className="h-7 w-7" aria-hidden="true" />
              <span className="text-[11px] font-semibold">{latest.isPdf ? "PDF đã tải" : "Tệp đã tải"}</span>
            </a>)
        : <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-ink-50/80 text-ink-400">
            {level === 2 && !partner ? <Camera className="h-7 w-7" aria-hidden="true" /> : <FileText className="h-7 w-7" aria-hidden="true" />}
            <span className="text-[11px] font-semibold">Chưa có bằng chứng</span>
          </div>}

      <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${latest ? "bg-emerald-600 text-white" : spec.required ? "bg-white/95 text-amber-900 ring-1 ring-amber-300" : "bg-white/95 text-ink-600 ring-1 ring-ink-200"}`}>
        {latest ? "Đã có" : level === 3 ? "Chọn nếu phù hợp" : spec.required ? "Bắt buộc" : "Tùy chọn"}
      </span>
      {needsCode && <span title="Phải có tờ giấy viết tay mã xác minh trong khung hình"
        className="absolute top-2 right-2 rounded-full bg-brand-700/95 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">🔖 Cần tờ mã</span>}
      {latest?.aiVerdict && <span className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm ${latest.aiVerdict === "pass" ? "bg-violet-100 text-violet-900" : latest.aiVerdict === "fail" ? "bg-rose-100 text-rose-900" : "bg-white/95 text-violet-900"}`}>
        AI: {latest.aiVerdict === "pass" ? "có vẻ phù hợp" : latest.aiVerdict === "fail" ? "cần kiểm tra" : "chưa đủ cơ sở"}
      </span>}
      {rows.length > 1 && <span className="absolute right-2 bottom-2 rounded-full bg-ink-900/80 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">{rows.length} tệp</span>}
    </div>

    <div className="flex flex-1 flex-col gap-2 p-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold tracking-wider text-ink-400 uppercase">Mục {spec.order}</p>
        <h3 className="mt-0.5 text-[13px] leading-4 font-bold text-ink-900">
          {spec.label}{needsCode && <span className="ml-1" title="Phải có tờ giấy viết tay mã xác minh trong khung hình">🔖</span>}
        </h3>
        <p className="mt-0.5 text-[10.5px] leading-4 text-ink-500">{spec.requirement ?? (spec.required ? "Mục bắt buộc" : "Nếu có")}</p>
      </div>

      {latest && <p className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-ink-500">
        <span className="inline-flex items-center gap-0.5">{latest.isPdf ? <FileText className="size-3" aria-hidden="true" /> : <Image className="size-3" aria-hidden="true" />}{latest.isPdf ? "PDF" : "Ảnh"}</span>
        <span aria-hidden="true">·</span>
        <span>tải {when(latest.uploadedAt)}</span>
      </p>}

      {latest && latest.flags.length > 0 && <p className={`flex items-start gap-1 rounded-md px-2 py-1 text-[10px] leading-4 ${hardFlags.length ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>
        {hardFlags.length ? <ShieldAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />}
        {hardFlags.length ? `${hardFlags.length} điểm bắt buộc cần sửa` : `${softFlags.length} điểm cần lưu ý`}
      </p>}

      <div className="mt-auto space-y-1.5 pt-1">
        {rows.length > 0 && <ul className="space-y-1">
          {rows.map((row, index) => <li key={row.id} className="flex items-center justify-between gap-2 rounded-md bg-ink-50 px-2 py-1 text-[10.5px]">
            <a href={row.href} target="_blank" rel="noreferrer" className="min-w-0 truncate font-semibold text-brand-800 underline underline-offset-2">{row.isPdf ? "Mở PDF" : "Mở ảnh"} {index + 1} · {when(row.uploadedAt)}</a>
            {editable && <button type="button" disabled={busy || paused} onClick={() => void remove(row, index)} className="shrink-0 text-rose-600 hover:underline disabled:opacity-40" aria-label={`Xóa tệp ${index + 1} của ${row.label}`}><Trash2 className="size-3.5" aria-hidden="true" /></button>}
          </li>)}
        </ul>}

        {latest && <details className="rounded-md border border-ink-100 bg-ink-50/60 px-2 py-1.5">
          <summary className="cursor-pointer text-[10.5px] font-semibold text-ink-600">{level === 2 && !partner ? "Chi tiết kỹ thuật & AI" : "Chi tiết tệp"}</summary>
          <div className="mt-1.5 space-y-1.5 text-[10.5px] leading-4 text-ink-600">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={latest.hasExif ? "font-bold text-emerald-700" : "font-bold text-ink-500"}>{latest.hasExif ? "Có dữ liệu ảnh gốc" : "Không còn dữ liệu ảnh gốc (vẫn nhận)"}</span>
              <span className="inline-flex items-center gap-0.5"><MapPin className="size-3 shrink-0 text-ink-400" aria-hidden="true" />
                {latest.exifLat != null && latest.exifLng != null ? `${latest.exifLat.toFixed(4)}, ${latest.exifLng.toFixed(4)}` : "không có GPS"}</span>
              {latest.exifCapturedLabel && <span>Chụp lúc {latest.exifCapturedLabel}</span>}
            </p>
            <dl className="grid gap-0.5">
              <div>Tải lên lúc: {when(latest.uploadedAt)}</div>
              {latest.camera && <div>Thiết bị: {latest.camera}</div>}
              {latest.software && <div>Phần mềm ghi tệp: {latest.software}</div>}
              {latest.width != null && <div>{latest.width}×{latest.height}px · {Math.round((latest.bytes ?? 0) / 1024)} KB</div>}
              {latest.captureLat != null && <div>Vị trí trình duyệt: {latest.captureLat.toFixed(5)}, {latest.captureLng?.toFixed(5)}{latest.captureAccuracy != null ? ` (±${Math.round(latest.captureAccuracy)} m)` : ""}</div>}
            </dl>
            {latest.flags.length > 0 && <ul className="space-y-1">
              {latest.flags.map((flag) => <li key={flag.flag} className={`rounded px-1.5 py-1 ${requiresFix(flag) ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>
                <strong>{flag.source === "ai" ? "AI lưu ý · " : ""}{flag.label}.</strong> {flag.detail ?? ""}
              </li>)}
            </ul>}
            {latest.aiVerdict && <div className="rounded bg-white/80 px-1.5 py-1 ring-1 ring-violet-100">
              <p className="flex items-center gap-1 font-bold text-violet-900"><Sparkles className="size-3 text-violet-600" aria-hidden="true" />
                AI: {latest.aiVerdict === "pass" ? "có vẻ phù hợp" : latest.aiVerdict === "fail" ? "cần kiểm tra" : "chưa đủ cơ sở"}
              </p>
              {latest.aiReason && <p className="mt-0.5">{latest.aiReason}</p>}
              {latest.aiDetectedText && <p className="mt-0.5">Chữ đọc được: “{latest.aiDetectedText}”</p>}
              {(latest.aiCodeRead || latest.aiCodeVisible === false) && <p className="mt-0.5">
                Mã viết tay: {latest.aiCodeVisible === false ? "AI chưa thấy tờ giấy trong ảnh" : `AI đọc được “${latest.aiCodeRead}”`}
              </p>}
              <p className="mt-0.5 text-ink-500">AI chỉ gợi ý; kết quả xác minh do bộ phận duyệt quyết định.</p>
            </div>}
            {level === 2 && !partner && <p className="text-ink-500">Ảnh không có toạ độ hay bị nén lại vẫn được nhận. Điểm này chỉ giúp người duyệt biết cần xem kỹ chỗ nào.</p>}
          </div>
        </details>}

        {error && <p role="alert" className="text-[10.5px] font-semibold text-rose-700">{error}</p>}
        {needsCode && <p className="text-[10px] font-semibold text-brand-800">🔖 Ảnh này bắt buộc có tờ mã xác minh đặt cạnh cảnh.</p>}

        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => void onPick(e)} />
        <button type="button" disabled={!editable || busy || paused || full} onClick={() => inputRef.current?.click()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-ink-300">
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Camera className="size-3.5" aria-hidden="true" />}
          {busy ? "Đang xử lý..." : full ? `Đã đủ ${MAX_ITEMS_PER_KEY} tệp` : (level === 3 || partner) ? rows.length ? "Tải thêm tệp" : "Tải tệp" : rows.length ? "Chụp/thay bằng chứng" : "Chụp hoặc chọn ảnh"}
        </button>
        {full && editable && <p className="text-[10px] text-ink-500">Xóa một tệp nếu cần tải tệp khác.</p>}
        {!editable && <p className="text-[10px] text-ink-500">Hồ sơ đang chờ xét hoặc đã được nhận nên bằng chứng bị khóa.</p>}
      </div>
    </div>
  </article>;
}
