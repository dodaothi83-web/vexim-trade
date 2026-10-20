"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Crosshair, Link2, Loader2, MapPin, Printer, RefreshCw, ScanSearch, Send, Sparkles } from "lucide-react";

import { VERIFICATION_CODE_TTL_HOURS } from "@/lib/verification-submission";
import type { PortalItemSpec, PortalSubmissionView } from "@/lib/supplier-portal/submission-view";
import {
  addSourceLinkAction,
  deleteSourceLinkAction,
  issueSubmissionCodeAction,
  saveShipmentAction,
} from "./submission-actions";
import { SubmissionItemCard } from "./submission-item-card";

interface GpsState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  at: string | null;
  state: "idle" | "asking" | "on" | "denied" | "unsupported";
}

interface ScanResult {
  status: string;
  message: string;
  aiScanned: boolean;
  summary: string | null;
  reasons: string[];
  missing: string[];
  warnings: string[];
}

const NO_GPS: GpsState = { lat: null, lng: null, accuracy: null, at: null, state: "idle" };

/**
 * Bảng điều khiển tự xác thực của MỘT cấp (L2 hoặc L3):
 * tạo mã xác minh, bật định vị, tải 9 ảnh / chứng từ, khai link nguồn, AI quét & nộp.
 */
export function VerificationSubmissionPanel({ view, specs }: { view: PortalSubmissionView; specs: PortalItemSpec[] }) {
  const router = useRouter();
  const level = view.level;
  const [gps, setGps] = useState<GpsState>(view.deviceLat != null
    ? { lat: view.deviceLat, lng: view.deviceLng, accuracy: view.deviceAccuracy, at: null, state: "on" }
    : NO_GPS);
  const [busy, setBusy] = useState<"" | "code" | "scan" | "submit" | "link">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [printed, setPrinted] = useState(false);

  const refresh = useCallback(() => { router.refresh(); }, [router]);
  const say = useCallback((text: string, ok: boolean) => {
    setMessage({ text, ok });
    refresh();
  }, [refresh]);

  // Định vị là yêu cầu bắt buộc của L2: hỏi quyền ngay khi mở bảng.
  useEffect(() => {
    if (level !== 2 || gps.state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGps((g) => ({ ...g, state: "unsupported" })); return; }
    setGps((g) => ({ ...g, state: "asking" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: new Date().toISOString(), state: "on" }),
      () => setGps((g) => ({ ...g, state: "denied" })),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, [level, gps.state]);

  async function issueCode() {
    if (busy) return;
    setBusy("code"); setMessage(null);
    try {
      const form = new FormData();
      form.set("submission_id", view.id);
      const result = await issueSubmissionCodeAction(form);
      setMessage({ text: result.message, ok: result.ok });
      refresh();
    } catch {
      setMessage({ text: "Không phát hành được mã. Thử lại sau.", ok: false });
    } finally { setBusy(""); }
  }

  function printCodeSheet(code: string) {
    const sheet = window.open("", "_blank", "width=720,height=900");
    if (!sheet) { setMessage({ text: "Trình duyệt chặn cửa sổ in. Hãy cho phép popup để in mã.", ok: false }); return; }
    sheet.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Mã xác minh Vexim</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;margin:40px;color:#0f172a}
  .box{border:3px dashed #0f766e;border-radius:16px;padding:28px;text-align:center}
  .code{font-size:44px;font-weight:900;letter-spacing:.14em;margin:12px 0}
  .hand{margin-top:24px;border:1px solid #cbd5e1;border-radius:12px;padding:18px;text-align:left}
  h1{font-size:18px;margin:0 0 6px}p{margin:6px 0;line-height:1.55;font-size:13px}
  .small{font-size:11px;color:#475569}
</style></head><body>
<h1>Mã xác minh nhà máy — Vexim Trade</h1>
<p class="small">In tờ này (hoặc chép tay đúng mã bên dưới vào một tờ giấy), rồi CẦM VÀO KHUNG HÌNH khi chụp các ảnh có đánh dấu 🔖.</p>
<div class="box">
  <p style="margin:0;font-size:12px;letter-spacing:.12em">MÃ XÁC MINH VIẾT TAY</p>
  <div class="code">${code}</div>
  <p class="small">Mã có hiệu lực ${VERIFICATION_CODE_TTL_HOURS} giờ kể từ lúc phát hành. Mỗi hồ sơ dùng một mã riêng.</p>
</div>
<div class="hand">
  <p><strong>Chép tay vào đây (nếu không in):</strong></p>
  <p style="border-bottom:1px solid #94a3b8;height:28px"></p>
  <p><strong>Ngày chụp:</strong> ……/……/………… &nbsp;&nbsp; <strong>Người chụp:</strong> ………………………………</p>
</div>
<p class="small">Yêu cầu: bật định vị camera · chụp ban ngày · không chỉnh sửa · gửi ảnh gốc (không gửi qua Zalo/Facebook vì sẽ mất dữ liệu định vị).</p>
<script>window.print()</script>
</body></html>`);
    sheet.document.close();
    setPrinted(true);
  }

  async function runScan(submit: boolean) {
    if (busy) return;
    if (submit && !window.confirm("Nộp hồ sơ để AI quét và Vexim xét duyệt? Ảnh/chứng từ sẽ được gửi tới dịch vụ AI để phân tích sơ bộ; bằng chứng bị khóa sau khi nộp.")) return;
    setBusy(submit ? "submit" : "scan"); setMessage(null); setScan(null);
    try {
      const response = await fetch(`/api/supplier-portal/submissions/${encodeURIComponent(view.id)}/ai-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submit }),
      });
      const data = await response.json() as (ScanResult & { ok?: boolean; message?: string }) & { message?: string };
      if (!response.ok) { setMessage({ text: data.message ?? "Không quét được.", ok: false }); return; }
      setScan({ status: data.status, message: data.message ?? "", aiScanned: Boolean(data.aiScanned), summary: data.summary ?? null, reasons: data.reasons ?? [], missing: data.missing ?? [], warnings: data.warnings ?? [] });
      setMessage({ text: data.message ?? "Đã quét.", ok: Boolean(data.ok) });
      refresh();
    } catch {
      setMessage({ text: "Không kết nối được máy chủ. Tệp đã tải vẫn được giữ.", ok: false });
    } finally { setBusy(""); }
  }

  async function saveShipment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    form.set("submission_id", view.id);
    setBusy("link");
    try {
      const result = await saveShipmentAction(form);
      setMessage({ text: result.message, ok: result.ok });
      refresh();
    } catch {
      setMessage({ text: "Không lưu được thông tin lô hàng.", ok: false });
    } finally { setBusy(""); }
  }

  async function addLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    form.set("submission_id", view.id);
    setBusy("link");
    try {
      const result = await addSourceLinkAction(form);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) event.currentTarget.reset();
      refresh();
    } catch {
      setMessage({ text: "Không lưu được link.", ok: false });
    } finally { setBusy(""); }
  }

  async function removeLink(linkId: string) {
    if (busy || !window.confirm("Xóa link nguồn này khỏi hồ sơ?")) return;
    const form = new FormData();
    form.set("submission_id", view.id);
    form.set("link_id", linkId);
    setBusy("link");
    try {
      const result = await deleteSourceLinkAction(form);
      setMessage({ text: result.message, ok: result.ok });
      refresh();
    } finally { setBusy(""); }
  }

  const gpsText = gps.state === "on" && gps.lat != null
    ? `Đã bật định vị: ${gps.lat.toFixed(5)}, ${gps.lng?.toFixed(5)}${gps.accuracy != null ? ` (±${Math.round(gps.accuracy)} m)` : ""}`
    : gps.state === "asking" ? "Đang xin quyền định vị..."
      : gps.state === "denied" ? "Trình duyệt đang chặn định vị — hãy bật lại trong cài đặt trang, nếu không ảnh sẽ bị nêu cờ “không có toạ độ”."
        : gps.state === "unsupported" ? "Thiết bị/trình duyệt không có định vị. Ảnh vẫn tải được nhưng sẽ bị nêu cờ để Vexim kiểm tra thêm."
          : "Chưa có vị trí. Hãy cho phép trang dùng vị trí để ảnh được gắn toạ độ.";

  const progress = view.requiredTotal > 0 ? Math.min(100, Math.round((view.uploadedTotal / view.requiredTotal) * 100)) : 0;

  return <section id={`level-${level}`} className="mt-8 scroll-mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-black text-slate-900">{level === 2 ? "L2 · Xác thực nhà máy (9 ảnh bắt buộc)" : "L3 · Lịch sử xuất khẩu"}</h2>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-3 py-1.5 font-bold ${view.status === "pending_review" ? "bg-amber-100 text-amber-800" : view.status === "accepted" ? "bg-emerald-100 text-emerald-800" : view.status === "returned" ? "bg-rose-100 text-rose-800" : "bg-slate-200 text-slate-700"}`}>{view.statusLabel}</span>
        <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-slate-600 ring-1 ring-slate-200">{view.uploadedTotal}/{view.requiredTotal} mục bắt buộc</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Tiến độ hồ sơ L${level}`}>
        <div className={`h-full rounded-full transition-all ${view.ready ? "bg-emerald-500" : "bg-teal-600"}`} style={{ width: `${progress}%` }} />
      </div>
    </header>

    {view.status === "accepted" && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <CheckCircle2 className="mr-1 inline size-4" /> Vexim đã nhận hồ sơ này vào đợt kiểm của nhân viên và khóa bằng chứng. Việc duyệt huy hiệu L{level} là bước riêng, do người có quyền duyệt quyết định.
    </p>}
    {view.status === "returned" && view.reviewNote && <p className="mt-3 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <strong>Vexim/AI nêu lý do cần bổ sung:</strong> {view.reviewNote}
    </p>}
    {view.status === "pending_review" && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <Clock className="mr-1 inline size-4" /> Hồ sơ đang trong hàng đợi chờ Vexim xét duyệt{view.aiScannedAt ? ` · AI quét lúc ${new Date(view.aiScannedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}` : " · chưa có kết quả quét AI"}.
    </p>}

    {level === 2 && <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-teal-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900">Bước 1 · Mã xác minh viết tay</h3>
        {view.code
          ? <div className="mt-2">
              <p className="font-mono text-2xl font-black tracking-[0.12em] text-teal-800">{view.code}</p>
              <p className="mt-1 text-xs text-slate-600">
                Phát hành lúc {view.codeIssuedAt ? new Date(view.codeIssuedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—"} · hiệu lực {view.codeTtlHours} giờ
                {view.codeExpired ? " · ĐÃ HẾT HẠN, hãy tạo mã mới" : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => printCodeSheet(view.code!)} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800"><Printer className="size-3.5" /> In tờ mã xác minh</button>
                {view.editable && <button type="button" disabled={busy === "code"} onClick={() => void issueCode()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><RefreshCw className="size-3.5" /> Tạo mã mới</button>}
              </div>
              {printed && <p className="mt-2 text-[11px] text-slate-500">Không in được? Chép tay đúng mã trên vào tờ giấy, ký tên và ghi ngày chụp.</p>}
            </div>
          : <div className="mt-2">
              <p className="text-xs text-slate-600">Bấm nút để hệ thống phát hành mã. In hoặc chép tay mã lên giấy, cầm vào khung hình khi chụp các ảnh có 🔖 (cổng nhà máy, dây chuyền, kho thành phẩm).</p>
              <button type="button" disabled={busy === "code" || !view.editable} onClick={() => void issueCode()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">
                {busy === "code" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Tạo mã xác minh
              </button>
            </div>}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Crosshair className="size-4 text-teal-700" /> Bước 2 · Định vị camera</h3>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600"><MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" />{gpsText}</p>
        <p className="mt-2 text-xs text-slate-600">Hệ thống đọc cả GPS <strong>bên trong ảnh gốc</strong> (EXIF) và vị trí trình duyệt, rồi đối chiếu hai giá trị. Ảnh không có GPS sẽ bị nêu cờ.</p>
        {gps.state !== "on" && <button type="button" disabled={gps.state === "asking" || gps.state === "unsupported"} onClick={() => setGps(NO_GPS)}
          className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Hỏi lại quyền định vị</button>}
        <p className="mt-2 text-[11px] text-slate-500">Mẹo: mở trang này trên điện thoại đang đứng tại nhà máy, chụp trực tiếp bằng camera có bật vị trí, rồi tải ảnh đó lên (không gửi ảnh qua ứng dụng chat trước).</p>
      </div>
    </div>}

    {level === 3 && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900">Lô hàng dùng làm bằng chứng (doanh nghiệp tự khai)</h3>
      <form onSubmit={(e) => void saveShipment(e)} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="submission_id" value={view.id} />
        <label className="text-xs font-semibold text-slate-700">Mã lô / số hợp đồng<input name="shipment_ref" defaultValue={view.shipmentRef ?? ""} maxLength={120} disabled={!view.editable} className="input mt-1" placeholder="VD: PO-2026-118" /></label>
        <label className="text-xs font-semibold text-slate-700">Ngày giao hàng<input type="date" name="shipped_on" defaultValue={view.shippedOn ?? ""} disabled={!view.editable} className="input mt-1" /></label>
        <label className="text-xs font-semibold text-slate-700">Nơi đến / cảng dỡ<input name="destination" defaultValue={view.shipmentDestination ?? ""} maxLength={160} disabled={!view.editable} className="input mt-1" placeholder="VD: Hamburg, Đức" /></label>
        <label className="text-xs font-semibold text-slate-700">Ghi chú (không bắt buộc)<input name="note" defaultValue={view.supplierNote ?? ""} maxLength={500} disabled={!view.editable} className="input mt-1" placeholder="VD: lô hạt điều WW320, 1 container 20ft" /></label>
        <div className="sm:col-span-2 lg:col-span-4"><button type="submit" disabled={!view.editable || busy !== ""} className="btn btn-ghost text-xs">Lưu thông tin lô hàng</button>
          <p className="mt-1 text-[11px] text-slate-500">Thông tin này là NCC tự khai, không phải dữ liệu Hải quan; Vexim sẽ đối chiếu với chứng từ bạn tải lên.</p></div>
      </form>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Link2 className="size-4 text-teal-700" /> Link nguồn gốc công khai</h4>
        <p className="mt-1 text-xs text-slate-600">Dán link trang công khai có nhắc tới doanh nghiệp/lô hàng (trang doanh nghiệp, hồ sơ trên sàn B2B, tin hội chợ…). Hệ thống chỉ tự đọc các domain trong danh sách nguồn công khai của Vexim; link lạ vẫn được lưu để nhân viên tự mở.</p>
        <form onSubmit={(e) => void addLink(e)} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[240px] flex-1 text-xs font-semibold text-slate-700">Link (http/https)<input name="url" type="url" required maxLength={800} disabled={!view.editable} className="input mt-1" placeholder="https://..." /></label>
          <label className="min-w-[180px] flex-1 text-xs font-semibold text-slate-700">Mô tả ngắn<input name="label" maxLength={200} disabled={!view.editable} className="input mt-1" placeholder="VD: hồ sơ doanh nghiệp trên sàn" /></label>
          <button type="submit" disabled={!view.editable || busy === "link"} className="btn btn-primary text-xs">{busy === "link" ? "Đang lưu..." : "Thêm link"}</button>
        </form>
        {view.links.length > 0 && <ul className="mt-3 space-y-2 text-xs">
          {view.links.map((link) => <li key={link.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 p-2.5">
            <span className="min-w-0 break-all"><a href={link.url} target="_blank" rel="noreferrer" className="font-semibold text-teal-800 underline">{link.url}</a>
              {link.label && <span className="text-slate-600"> · {link.label}</span>}
              <span className="mt-1 block text-[11px] text-slate-600">
                {link.allowedSource ? "Nguồn công khai được phép quét" : "Ngoài danh sách nguồn công khai — nhân viên sẽ tự mở"}
                {link.fetchNote ? ` · ${link.fetchNote}` : ""}
              </span>
            </span>
            {view.editable && <button type="button" onClick={() => void removeLink(link.id)} className="text-[11px] font-semibold text-rose-600 hover:underline">Xóa</button>}
          </li>)}
        </ul>}
      </div>
    </div>}

    {message && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${message.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>{message.text}</p>}

    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {specs.map((spec) => <SubmissionItemCard key={spec.key} spec={spec} level={level} submissionId={view.id} editable={view.editable}
        rows={view.items.filter((i) => i.key === spec.key)} gps={gps} codeIssued={Boolean(view.code) && !view.codeExpired}
        onChanged={say} />)}
    </div>

    {!view.ready && view.missing.length > 0 && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
      Còn thiếu {view.missing.length} mục bắt buộc: {view.missing.join("; ")}.
    </p>}
    {view.blockers.length > 0 && <ul className="mt-2 space-y-1 text-xs text-rose-800">
      {view.blockers.slice(0, 6).map((b) => <li key={b}>• {b}</li>)}
    </ul>}

    {/* Thanh hành động dính đáy màn hình: luôn thấy tiến độ + nút nộp dù đang lướt danh sách ảnh dài. */}
    <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      {!view.editable
        ? <span className="mr-auto text-[11px] font-semibold text-slate-500">Hồ sơ đang chờ xét hoặc đã được nhận — bằng chứng bị khóa.</span>
        : view.ready
          ? <span className="mr-auto text-[11px] font-semibold text-emerald-800">Đủ mục bắt buộc — sẵn sàng nộp cho Vexim xét duyệt.</span>
          : <span className="mr-auto text-[11px] font-semibold text-amber-800">Còn thiếu {view.missing.length} mục{level === 2 ? " (hoặc thiếu mã xác minh)" : ""} — xem danh sách vàng phía trên.</span>}
      <button type="button" disabled={busy !== "" || !view.editable} onClick={() => void runScan(false)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 disabled:opacity-50">
        {busy === "scan" ? <Loader2 className="size-3.5 animate-spin" /> : <ScanSearch className="size-3.5" />} AI quét thử
      </button>
      <button type="button" disabled={busy !== "" || !view.editable || !view.ready} onClick={() => void runScan(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">
        {busy === "submit" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} AI quét &amp; nộp hồ sơ
      </button>
    </div>

    {scan && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
      <h3 className="flex items-center gap-1.5 font-bold"><Sparkles className="size-4" /> Kết quả AI tự động</h3>
      <p className="mt-1">{scan.message}</p>
      {scan.summary && <p className="mt-2 text-[13px]">{scan.summary}</p>}
      {scan.reasons.length > 0 && <ul className="mt-2 space-y-1 text-[13px]">{scan.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>}
      {scan.warnings.length > 0 && <p className="mt-2 text-[12px] text-violet-800">Điểm cần lưu ý: {scan.warnings.slice(0, 5).join(" · ")}</p>}
      <p className="mt-2 text-[11px] text-violet-800">AI không xác nhận giấy tờ là thật và không tự duyệt. Hồ sơ đạt sẽ chờ nhân viên Vexim đối chiếu; huy hiệu L{level} chỉ có sau khi một người có quyền duyệt (khác người kiểm) phê.</p>
    </div>}
  </section>;
}
