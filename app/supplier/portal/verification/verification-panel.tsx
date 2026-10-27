"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Crosshair,
  Download,
  Factory,
  FileText,
  Link2,
  Loader2,
  MapPin,
  Printer,
  RefreshCw,
  ScanSearch,
  Send,
  ShieldCheck,
  Ship,
  Sparkles,
} from "lucide-react";

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
 * Bảng điều khiển tự xác thực của MỘT cấp (L2 hoặc L3).
 *
 * Bố cục theo nhịp trang sản phẩm của sàn TMĐT: dải tổng quan (trạng thái + tiến độ),
 * lưới thẻ bằng chứng có ảnh thu nhỏ, cột tóm tắt dính bên phải với nút nộp, và thanh
 * hành động cố định ở đáy trên điện thoại. Toàn bộ hành vi giữ nguyên: tạo mã, tải/in
 * tờ mã, định vị, tải tệp, xóa tệp, khai link, AI quét thử, AI quét & nộp, khóa hồ sơ.
 */
export function VerificationSubmissionPanel({ view, specs }: { view: PortalSubmissionView; specs: PortalItemSpec[] }) {
  const router = useRouter();
  const level = view.level;
  const partner = level === 2 && view.l2Scope === "partner_contract";
  const factory = level === 2 && !partner;
  const manual = level === 3 || partner;
  const [gps, setGps] = useState<GpsState>(view.deviceLat != null
    ? { lat: view.deviceLat, lng: view.deviceLng, accuracy: view.deviceAccuracy, at: null, state: "on" }
    : NO_GPS);
  const [busy, setBusy] = useState<"" | "code" | "scan" | "submit" | "link">("");
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [printed, setPrinted] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const refresh = useCallback(() => { router.refresh(); }, [router]);
  const say = useCallback((text: string, ok: boolean) => {
    setMessage({ text, ok });
    refresh();
  }, [refresh]);

  // Định vị là yêu cầu bắt buộc của L2: hỏi quyền ngay khi mở bảng.
  useEffect(() => {
    if (!factory || gps.state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGps((g) => ({ ...g, state: "unsupported" })); return; }
    setGps((g) => ({ ...g, state: "asking" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: new Date().toISOString(), state: "on" }),
      () => setGps((g) => ({ ...g, state: "denied" })),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, [factory, gps.state]);

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

  /**
   * Tải tờ mã về máy dưới dạng ảnh PNG để in hoặc mở lại khi không có mạng.
   * Vẽ bằng canvas ở trình duyệt nên không phụ thuộc font của máy chủ.
   */
  function downloadCodeSheet(code: string) {
    const width = 1240, height = 1754;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setMessage({ text: "Trình duyệt không tạo được tờ mã. Dùng nút “In tờ mã” thay thế.", ok: false });
      return;
    }
    const line = (text: string, x: number, y: number, font: string, color = "#0f172a") => {
      ctx.fillStyle = color;
      ctx.font = font;
      ctx.fillText(text, x, y);
    };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#0f766e";
    ctx.fillRect(0, 0, width, 132);
    line("VEXIM TRADE", 80, 84, "bold 46px Arial, Helvetica, sans-serif", "#ffffff");
    line("Phiếu xác minh nhà máy", 80, 226, "bold 44px Arial, Helvetica, sans-serif");
    line("Cấp L2 · ảnh nhà máy", 80, 272, "26px Arial, Helvetica, sans-serif", "#475569");

    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 6;
    ctx.setLineDash([20, 14]);
    ctx.strokeRect(80, 310, width - 160, 300);
    ctx.setLineDash([]);
    ctx.textAlign = "center";
    line("MÃ XÁC MINH", width / 2, 372, "bold 26px Arial, Helvetica, sans-serif", "#0f766e");
    line(code, width / 2, 478, "bold 86px Arial, Helvetica, sans-serif", "#0b3b36");
    line(`Mã có hiệu lực ${VERIFICATION_CODE_TTL_HOURS} giờ kể từ lúc phát hành`, width / 2, 540, "24px Arial, Helvetica, sans-serif", "#475569");
    ctx.textAlign = "left";

    const bullets = [
      "1. In phiếu này ra giấy (hoặc mở trên một điện thoại thứ hai).",
      "2. Đặt phiếu cạnh cảnh cần chụp, sao cho đọc rõ mã trong ảnh.",
      "3. Chụp đủ 3 ảnh có đánh dấu: cổng nhà máy, dây chuyền đang chạy, kho thành phẩm.",
      "4. Mỗi ảnh chỉ dùng cho đúng hồ sơ này. Chụp lại thì tạo mã mới.",
    ];
    bullets.forEach((text, index) => line(text, 96, 690 + index * 56, "26px Arial, Helvetica, sans-serif"));

    line("Không in được? Chép tay đúng mã ở trên vào giấy trắng rồi chụp cùng cảnh.", 96, 958, "bold 26px Arial, Helvetica, sans-serif", "#0b3b36");
    line("Ngày chụp:  …… / …… / …………", 96, 1060, "28px Arial, Helvetica, sans-serif");
    line("Người chụp:  …………………………………………", 96, 1120, "28px Arial, Helvetica, sans-serif");
    line("Chức vụ / bộ phận:  …………………………………", 96, 1180, "28px Arial, Helvetica, sans-serif");

    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, 1260);
    ctx.lineTo(width - 80, 1260);
    ctx.stroke();
    line("Ảnh chụp bằng điện thoại là được, không cần ảnh gốc. Điều bắt buộc là phiếu này phải nằm trong ảnh.", 80, 1320, "24px Arial, Helvetica, sans-serif", "#475569");
    line("Nhân viên Vexim sẽ đối chiếu mã trên phiếu với mã hệ thống đã phát hành.", 80, 1364, "24px Arial, Helvetica, sans-serif", "#475569");
    line("Vexim Trade · veximtrade.com/how-we-verify", 80, 1680, "22px Arial, Helvetica, sans-serif", "#94a3b8");

    canvas.toBlob((blob) => {
      if (!blob) {
        setMessage({ text: "Không tạo được tệp tờ mã. Dùng nút in thay thế.", ok: false });
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `phieu-xac-minh-${code}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage({ text: `Đã tải tờ mã ${code}. In ra giấy rồi đặt cạnh cảnh khi chụp 3 ảnh có đánh dấu 🔖.`, ok: true });
      setDownloaded(true);
    }, "image/png");
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
<h1>Mã xác minh nhà máy - Vexim Trade</h1>
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
<p class="small">In tờ này ra giấy, đặt cạnh cảnh khi chụp 3 ảnh có đánh dấu. Ảnh chụp bằng điện thoại là đủ, không cần ảnh gốc.</p>
<script>window.print()</script>
</body></html>`);
    sheet.document.close();
    setPrinted(true);
  }

  async function runScan(submit: boolean) {
    if (busy || evidenceBusy || (manual && !submit)) return;
    if (submit && !window.confirm(manual
      ? "Nộp hồ sơ để nhân viên kiểm tra? Chứng từ sẽ tạm khóa trong khi xét."
      : "Nộp hồ sơ để AI quét sơ bộ và chuyển sang bước duyệt? Ảnh sẽ được gửi tới dịch vụ AI để phân tích; bằng chứng bị khóa sau khi nộp.")) return;
    setBusy(submit ? "submit" : "scan"); setMessage(null); setScan(null);
    try {
      const response = await fetch(`/api/supplier-portal/submissions/${encodeURIComponent(view.id)}/ai-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submit }),
      });
      const data = await response.json() as (ScanResult & { ok?: boolean; message?: string }) & { message?: string };
      if (!response.ok) { setMessage({ text: data.message ?? "Chưa xử lý được hồ sơ.", ok: false }); return; }
      if (factory) setScan({ status: data.status, message: data.message ?? "", aiScanned: Boolean(data.aiScanned), summary: data.summary ?? null, reasons: data.reasons ?? [], missing: data.missing ?? [], warnings: data.warnings ?? [] });
      setMessage({ text: data.message ?? "Đã gửi hồ sơ.", ok: Boolean(data.ok) });
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set("submission_id", view.id);
    setBusy("link");
    try {
      const result = await addSourceLinkAction(form);
      setMessage({ text: result.message, ok: result.ok });
      if (result.ok) formElement.reset();
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
      : gps.state === "denied" ? "Trình duyệt đang chặn định vị - hãy bật lại trong cài đặt trang, nếu không ảnh sẽ bị nêu cờ “không có toạ độ”."
        : gps.state === "unsupported" ? "Thiết bị/trình duyệt không có định vị. Ảnh vẫn tải được nhưng sẽ được ghi chú để kiểm tra thêm."
          : "Chưa có vị trí. Hãy cho phép trang dùng vị trí để ảnh được gắn toạ độ.";

  const progress = view.requiredTotal > 0 ? Math.min(100, Math.round((view.uploadedTotal / view.requiredTotal) * 100)) : 0;
  const doneSpecs = specs.filter((spec) => view.items.some((item) => item.key === spec.key)).length;
  const totalSpecs = specs.length;
  const levelTitle = partner ? "Nhà máy đối tác" : level === 2 ? "Xác thực nhà máy" : "Lịch sử xuất khẩu";
  const LevelIcon = level === 2 ? Factory : Ship;
  const locked = !view.editable;
  const statusTone = view.status === "pending_review" ? "bg-amber-100 text-amber-900"
    : view.status === "accepted" ? "bg-emerald-100 text-emerald-900"
      : view.status === "returned" ? "bg-rose-100 text-rose-900"
        : "bg-ink-100 text-ink-700";
  const progressNote = locked ? "Hồ sơ đã nộp - bằng chứng bị khóa."
    : view.ready ? level === 2 ? "Đủ mục bắt buộc, sẵn sàng nộp." : "Đã có chứng từ, sẵn sàng nộp."
      : level === 2 ? `Còn thiếu ${view.missing.length} mục bắt buộc.` : "Tải ít nhất một chứng từ.";
  const progressTone = locked ? "text-ink-500" : view.ready ? "text-emerald-800" : "text-amber-800";

  return <div id={`level-${level}`} className="mt-5 scroll-mt-20">

    {/* Dải tổng quan: trạng thái hồ sơ + tiến độ, đọc được trong một lần nhìn. */}
    <section aria-label={`Tổng quan hồ sơ L${level}`} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-brand-50 via-white to-white px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <LevelIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold tracking-[0.14em] text-brand-700 uppercase">Hồ sơ tự gửi · Bước {level}/3</p>
              <h2 className="mt-0.5 text-[17px] leading-tight font-black tracking-tight text-ink-900">{levelTitle}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone}`}>{view.statusLabel}</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200">
                  {partner ? `${view.items.length} tệp đã tải` : level === 2 ? `${doneSpecs}/${totalSpecs} ảnh đã tải` : `${view.items.length} chứng từ đã tải`}
                </span>
                {factory && <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800 ring-1 ring-brand-200">🔖 3 ảnh cần tờ mã</span>}
              </div>
            </div>
          </div>
          <div className="w-full shrink-0 sm:w-60">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-ink-600">Tiến độ bắt buộc</span>
              <span className="text-[13px] font-black tabular-nums text-ink-900">{view.uploadedTotal}/{view.requiredTotal}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Tiến độ hồ sơ L${level}`}>
              <div className={`h-full rounded-full transition-all ${view.ready ? "bg-emerald-500" : "bg-brand-600"}`} style={{ width: `${progress}%` }} />
            </div>
            <p className={`mt-1.5 text-[11px] font-semibold ${progressTone}`}>{progressNote}</p>
          </div>
        </div>
      </div>

      {view.status === "accepted" && <p className="border-t border-emerald-100 bg-emerald-50 px-4 py-2.5 text-[12px] leading-5 text-emerald-900 sm:px-5">
        <CheckCircle2 className="mr-1 inline size-4 align-[-2px]" aria-hidden="true" />
        Hồ sơ đã được nhận vào đợt kiểm và bằng chứng đã khóa. Việc duyệt huy hiệu L{level} là bước riêng, do người có quyền duyệt quyết định.
      </p>}
      {view.status === "returned" && view.reviewNote && <p className="whitespace-pre-wrap border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-[12px] leading-5 text-rose-900 sm:px-5">
        <strong>Lý do cần bổ sung:</strong> {view.reviewNote}
      </p>}
      {view.status === "pending_review" && <p className="border-t border-amber-100 bg-amber-50 px-4 py-2.5 text-[12px] leading-5 text-amber-900 sm:px-5">
        <Clock className="mr-1 inline size-4 align-[-2px]" aria-hidden="true" />
        {manual ? "Hồ sơ đang chờ nhân viên kiểm tra." : <>Hồ sơ đang trong hàng đợi duyệt{view.aiScannedAt ? ` · AI quét lúc ${new Date(view.aiScannedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}` : " · chưa có kết quả quét AI"}.</>}
      </p>}
    </section>

    {message && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${message.ok ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-900 ring-1 ring-rose-200"}`}>{message.text}</p>}

    {factory && scan && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
      <h3 className="flex items-center gap-1.5 font-bold"><Sparkles className="size-4" aria-hidden="true" /> Kết quả AI tự động</h3>
      <p className="mt-1">{scan.message}</p>
      {scan.summary && <p className="mt-2 text-[13px]">{scan.summary}</p>}
      {scan.reasons.length > 0 && <ul className="mt-2 space-y-1 text-[13px]">{scan.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>}
      {scan.warnings.length > 0 && <p className="mt-2 text-[12px] text-violet-800">Điểm cần lưu ý: {scan.warnings.slice(0, 5).join(" · ")}</p>}
      <p className="mt-2 text-[11px] text-violet-800">AI không xác nhận giấy tờ là thật và không tự duyệt. Hồ sơ đạt sẽ chờ đối chiếu thủ công; huy hiệu L{level} chỉ có sau khi người có quyền duyệt phê.</p>
    </div>}

    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 space-y-4">

        {/* L2 · tờ mã xác minh: bắt buộc trước khi chụp 3 ảnh 🔖. */}
        {factory && <section aria-labelledby="code-title" className="overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-brand-100 bg-brand-50 px-4 py-3">
            <h3 id="code-title" className="flex items-center gap-2 text-[14px] font-bold text-brand-900">
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Tờ mã xác minh
            </h3>
            <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${view.code ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
              {view.code ? (view.codeExpired ? "Mã đã hết hạn" : "Đã phát hành") : "Bắt buộc"}
            </span>
          </div>
          <div className="p-4">
            {view.code
              ? <>
                  <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-3 py-3 text-center">
                    <p className="text-[10px] font-bold tracking-[0.14em] text-brand-800 uppercase">Mã viết tay lên giấy</p>
                    <p className="mt-1 font-mono text-xl font-black tracking-[0.14em] break-all text-brand-900 sm:text-2xl">{view.code}</p>
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-ink-600">
                    Phát hành lúc {view.codeIssuedAt ? new Date(view.codeIssuedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "-"} · hiệu lực {view.codeTtlHours} giờ
                    {view.codeExpired ? <strong className="text-rose-700"> · ĐÃ HẾT HẠN, hãy tạo mã mới</strong> : null}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => downloadCodeSheet(view.code!)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-brand-800">
                      <Download className="size-3.5" aria-hidden="true" /> Tải tờ mã về
                    </button>
                    <button type="button" onClick={() => printCodeSheet(view.code!)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2.5 text-xs font-bold text-brand-800 transition hover:bg-brand-100">
                      <Printer className="size-3.5" aria-hidden="true" /> In tờ mã
                    </button>
                  </div>
                  {view.editable && <button type="button" disabled={busy === "code"} onClick={() => void issueCode()}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-600 underline-offset-2 hover:text-ink-900 hover:underline disabled:opacity-50">
                    {busy === "code" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3" aria-hidden="true" />} Tạo mã mới
                  </button>}
                  <p className={`mt-2 text-[11px] leading-4 ${downloaded || printed ? "text-ink-500" : "font-semibold text-brand-800"}`}>
                    {downloaded || printed
                      ? "Đã có tờ mã. In ra giấy rồi đặt cạnh cảnh khi chụp 3 ảnh có đánh dấu 🔖."
                      : "Bắt buộc: tải tờ mã về, in ra giấy rồi chụp cùng cảnh ở 3 ảnh có đánh dấu 🔖. Không có tờ mã thì hồ sơ chưa nộp được."}
                  </p>
                </>
              : <div>
                  <p className="text-[12px] leading-5 text-ink-600">Bấm nút để hệ thống phát hành mã. Sau đó tải tờ mã về, in ra giấy và chụp cùng cảnh ở 3 ảnh có 🔖 (cổng nhà máy, dây chuyền, kho thành phẩm).</p>
                  <button type="button" disabled={busy === "code" || !view.editable} onClick={() => void issueCode()}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-brand-800 disabled:bg-ink-300">
                    {busy === "code" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="size-3.5" aria-hidden="true" />} Tạo mã xác minh
                  </button>
                </div>}
          </div>
        </section>}

        {/* L3 · lô hàng dùng làm bằng chứng, khai trước khi tải chứng từ. */}
        {level === 3 && <section aria-labelledby="shipment-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 id="shipment-title" className="flex items-center gap-2 text-[14px] font-bold text-ink-900">
                <Ship className="h-4 w-4 text-brand-700" aria-hidden="true" /> Lô hàng dùng làm bằng chứng
              </h3>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-500">Thông tin do doanh nghiệp tự khai, dùng để đối chiếu với chứng từ bạn tải lên.</p>
            </div>
            <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[10.5px] font-bold text-ink-600">NCC tự khai</span>
          </div>
          <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] leading-4 text-emerald-900">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span><strong>Chứng từ của bạn được bảo mật và không hiển thị công khai.</strong> Chọn một lô hàng đã xuất và tải chứng từ của lô đó để nhân viên kiểm tra.</span>
          </p>
          <form onSubmit={(e) => void saveShipment(e)} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="submission_id" value={view.id} />
            <label className="text-xs font-semibold text-ink-700">Mã lô / số hợp đồng<input name="shipment_ref" defaultValue={view.shipmentRef ?? ""} maxLength={120} disabled={!view.editable} className="input mt-1" placeholder="VD: PO-2026-118" /></label>
            <label className="text-xs font-semibold text-ink-700">Ngày giao hàng<input type="date" name="shipped_on" defaultValue={view.shippedOn ?? ""} disabled={!view.editable} className="input mt-1" /></label>
            <label className="text-xs font-semibold text-ink-700">Nơi đến / cảng dỡ<input name="destination" defaultValue={view.shipmentDestination ?? ""} maxLength={160} disabled={!view.editable} className="input mt-1" placeholder="VD: Hamburg, Đức" /></label>
            <label className="text-xs font-semibold text-ink-700">Ghi chú (không bắt buộc)<input name="note" defaultValue={view.supplierNote ?? ""} maxLength={500} disabled={!view.editable} className="input mt-1" placeholder="VD: lô hạt điều WW320, 1 container 20ft" /></label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              <button type="submit" disabled={!view.editable || busy !== ""} className="btn btn-ghost text-xs">Lưu thông tin lô hàng</button>
              <p className="text-[10.5px] text-ink-500">Không phải dữ liệu Hải quan. RFQ trúng thầu không thay chứng từ giao hàng.</p>
            </div>
          </form>
        </section>}

        {/* Bộ bằng chứng: lưới thẻ ảnh/chứng từ. */}
        <section aria-labelledby="evidence-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 id="evidence-title" className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink-900">
                {partner ? "Hợp đồng và ảnh đối tác" : level === 2 ? "Bộ 9 ảnh nhà máy" : "Chứng từ lô hàng"}
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-800">{doneSpecs}/{totalSpecs}</span>
              </h3>
              <p className="mt-1 text-[11.5px] leading-5 text-ink-500">
                {partner
                  ? "Hợp đồng là bắt buộc; ảnh đối tác là tùy chọn. Hợp đồng nhận ảnh hoặc PDF, ảnh đối tác nhận JPG/PNG/WebP. Mỗi mục giữ tối đa 3 tệp. Chứng từ được giữ nội bộ, không hiển thị công khai."
                  : level === 2
                    ? "Chạm vào từng ô để chụp hoặc chọn ảnh có sẵn. Ảnh đã gửi qua Zalo vẫn nhận; ba mục 🔖 phải có tờ mã trong khung hình."
                    : "Tải ít nhất một chứng từ phù hợp dạng ảnh hoặc PDF; không bắt buộc vận đơn. Nhân viên sẽ xem chứng từ có đủ căn cứ và thể hiện vai trò doanh nghiệp hay không. Mỗi mục giữ tối đa 3 tệp; xóa một tệp nếu cần tải tệp khác."}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${view.ready ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              {view.ready ? "Đủ điều kiện nộp" : `Thiếu ${view.missing.length} mục`}
            </span>
          </div>

          {!view.ready && view.missing.length > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-5 text-amber-900">
            Còn thiếu: {view.missing.join("; ")}.
          </p>}

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {specs.map((spec) => <SubmissionItemCard key={spec.key} spec={spec} level={level} partner={partner} submissionId={view.id} editable={view.editable} paused={Boolean(busy) || evidenceBusy}
              rows={view.items.filter((i) => i.key === spec.key)} gps={gps} codeIssued={Boolean(view.code) && !view.codeExpired}
              onChanged={say} onBusyChange={setEvidenceBusy} />)}
          </div>
        </section>

        {/* L3 · link nguồn công khai. */}
        {level === 3 && <section aria-labelledby="links-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="links-title" className="flex items-center gap-2 text-[14px] font-bold text-ink-900">
              <Link2 className="h-4 w-4 text-brand-700" aria-hidden="true" /> Link nguồn gốc công khai
            </h3>
            <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-[10.5px] font-bold text-ink-600">{view.links.length} link</span>
          </div>
          <p className="mt-1 text-[11.5px] leading-5 text-ink-500">Dán link trang công khai có nhắc tới doanh nghiệp/lô hàng (trang doanh nghiệp, hồ sơ trên sàn B2B, tin hội chợ…). Hệ thống chỉ tự đọc domain trong danh sách nguồn công khai; link lạ vẫn được lưu để mở kiểm tra sau.</p>
          <form onSubmit={(e) => void addLink(e)} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto] sm:items-end">
            <label className="min-w-0 text-xs font-semibold text-ink-700">Link (http/https)<input name="url" type="url" required maxLength={800} disabled={!view.editable} className="input mt-1" placeholder="https://..." /></label>
            <label className="min-w-0 text-xs font-semibold text-ink-700">Mô tả ngắn<input name="label" maxLength={200} disabled={!view.editable} className="input mt-1" placeholder="VD: hồ sơ doanh nghiệp trên sàn" /></label>
            <button type="submit" disabled={!view.editable || busy === "link"} className="btn btn-primary text-xs">{busy === "link" ? "Đang lưu..." : "Thêm link"}</button>
          </form>
          {view.links.length > 0 && <ul className="mt-3 space-y-2">
            {view.links.map((link) => <li key={link.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2.5">
              <span className="min-w-0 text-[11.5px] break-all">
                <a href={link.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-800 underline">{link.url}</a>
                {link.label && <span className="text-ink-600"> · {link.label}</span>}
                <span className="mt-1 block text-[10.5px] text-ink-600">
                  {link.allowedSource ? "Nguồn công khai có thể kiểm tra" : "Ngoài danh sách nguồn công khai - nhân viên sẽ tự mở"}
                  {link.fetchNote ? ` · ${link.fetchNote}` : ""}
                </span>
              </span>
              {view.editable && <button type="button" onClick={() => void removeLink(link.id)} className="text-[11px] font-semibold text-rose-600 hover:underline">Xóa</button>}
            </li>)}
          </ul>}
        </section>}
      </div>

      {/* Cột tóm tắt dính: luôn thấy tiến độ và nút nộp khi lướt danh sách dài. */}
      <aside className="space-y-4 lg:sticky lg:top-20">
        {factory && <section aria-labelledby="gps-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h3 id="gps-title" className="flex items-center gap-1.5 text-[13px] font-bold text-ink-900">
              <Crosshair className="h-4 w-4 text-brand-700" aria-hidden="true" /> Vị trí khi chụp
            </h3>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${gps.state === "on" ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-600"}`}>
              {gps.state === "on" ? "Đã bật" : "Không bắt buộc"}
            </span>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-5 text-ink-600"><MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden="true" />{gpsText}</p>
          <p className="mt-1.5 text-[10.5px] leading-4 text-ink-500">Bật định vị giúp hồ sơ có thêm điểm đối chiếu; không bật vẫn nộp được.</p>
          {gps.state !== "on" && <button type="button" disabled={gps.state === "asking" || gps.state === "unsupported"} onClick={() => setGps(NO_GPS)}
            className="mt-2 w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-[11px] font-semibold text-ink-700 disabled:opacity-50">Hỏi lại quyền định vị</button>}
        </section>}

        <section aria-labelledby="submit-title" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
          <h3 id="submit-title" className="text-[14px] font-bold text-ink-900">Nộp hồ sơ</h3>
          <p className={`mt-1 text-[11.5px] leading-5 ${progressTone}`}>{locked
            ? "Hồ sơ đang chờ xét hoặc đã được nhận - bằng chứng bị khóa."
            : view.ready
              ? factory ? "Đủ mục bắt buộc. Nộp để AI quét sơ bộ và chuyển sang bước duyệt." : "Đã có chứng từ. Nộp để nhân viên kiểm tra."
              : partner ? "Tải hợp đồng với nhà máy đối tác." : level === 2 ? `Còn thiếu ${view.missing.length} mục, hoặc thiếu tờ mã trong ảnh 🔖.` : "Tải ít nhất một chứng từ phù hợp."}</p>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-ink-50 px-2 py-2">
              <dt className="text-[10px] font-semibold text-ink-500">Mục đã có</dt>
              <dd className="text-[15px] font-black tabular-nums text-ink-900">{doneSpecs}/{totalSpecs}</dd>
            </div>
            <div className="rounded-lg bg-ink-50 px-2 py-2">
              <dt className="text-[10px] font-semibold text-ink-500">{level === 2 ? "Mục bắt buộc" : "Chứng từ tối thiểu"}</dt>
              <dd className="text-[15px] font-black tabular-nums text-ink-900">{view.uploadedTotal}/{view.requiredTotal}</dd>
            </div>
          </dl>

          {view.blockers.length > 0 && <details className="mt-3 rounded-lg border border-ink-100 bg-ink-50/70 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-bold text-ink-700">Xem {view.blockers.length} việc cần xử lý</summary>
            <ul className="mt-1.5 space-y-1 text-[10.5px] leading-4 text-ink-600">
              {view.blockers.slice(0, 6).map((b) => <li key={b} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" aria-hidden="true" />{b}</li>)}
            </ul>
          </details>}

          <div className="mt-3 space-y-2">
            <button type="button" disabled={busy !== "" || evidenceBusy || locked || !view.ready} onClick={() => void runScan(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink-900 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-300">
              {busy === "submit" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Send className="size-3.5" aria-hidden="true" />} {factory ? "AI quét & nộp hồ sơ" : "Nộp hồ sơ"}
            </button>
            {factory && <button type="button" disabled={busy !== "" || evidenceBusy || locked} onClick={() => void runScan(false)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-4 py-2.5 text-xs font-bold text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "scan" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ScanSearch className="size-3.5" aria-hidden="true" />} AI quét thử
            </button>}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-ink-500">{factory ? "AI chỉ gợi ý; tải lên và quét không tự cấp huy hiệu." : "Nhân viên kiểm tra và quyết định; nộp hồ sơ không tự cấp xác minh."}</p>
        </section>

        <section aria-labelledby="tips-title" className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
          <h3 id="tips-title" className="flex items-center gap-1.5 text-[12.5px] font-bold text-brand-900">
            {factory ? <Camera className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
            {factory ? "Mẹo chụp ảnh" : "Mẹo chứng từ"}
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[10.5px] leading-4 text-ink-600">
            {factory
              ? <>
                  <li>Chụp ban ngày, đủ sáng, thấy rõ biển tên công ty.</li>
                  <li>Đặt tờ mã ngay cạnh cảnh, mã phải đọc được trong ảnh.</li>
                  <li>Chụp ngay tại nhà máy rồi tải lên là nhanh nhất.</li>
                </>
              : partner ? <>
                  <li>Giữ rõ tên doanh nghiệp của bạn và nhà máy đối tác trong hợp đồng.</li>
                  <li>Có thể che giá và thông tin nhạy cảm, nhưng giữ đủ nội dung để đối chiếu.</li>
                  <li>Đối chiếu hợp đồng không xác nhận sở hữu nhà máy hay kiểm thực địa.</li>
                </> : <>
                  <li>Chứng từ phải của đúng lô hàng bạn khai bên trên.</li>
                  <li>Có thể che giá, số tài khoản và thông tin nhạy cảm; giữ đủ dữ kiện để đối chiếu giao dịch.</li>
                  <li>Ảnh chụp hoặc PDF đều nhận; không cần bản gốc.</li>
                </>}
          </ul>
          <p className="mt-2 flex items-start gap-1 text-[10px] leading-4 text-brand-900"><ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden="true" /> Hồ sơ được đối chiếu thủ công; kết quả do người có quyền duyệt quyết định.</p>
        </section>
      </aside>
    </div>

    {/* Thanh hành động cho điện thoại: luôn thấy tiến độ và nút nộp. */}
    <div className="sticky bottom-0 z-20 mt-4 flex items-center gap-2 rounded-xl border border-ink-200 bg-white/95 p-2.5 shadow-lg backdrop-blur lg:hidden">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-ink-900">{view.uploadedTotal}/{view.requiredTotal} {level === 2 ? "mục bắt buộc" : "chứng từ tối thiểu"} · {progress}%</p>
        <p className={`truncate text-[10.5px] ${progressTone}`}>{progressNote}</p>
      </div>
      {factory && <button type="button" disabled={busy !== "" || evidenceBusy || locked} onClick={() => void runScan(false)} aria-label="AI quét thử (thanh dưới)"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-300 bg-violet-50 text-violet-800 disabled:opacity-50">
        {busy === "scan" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ScanSearch className="size-4" aria-hidden="true" />}
      </button>}
      <button type="button" disabled={busy !== "" || evidenceBusy || locked || !view.ready} onClick={() => void runScan(true)} aria-label={factory ? "AI quét và nộp hồ sơ" : "Nộp hồ sơ"}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-ink-900 px-3.5 text-xs font-bold text-white disabled:bg-ink-300">
        {busy === "submit" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />} Nộp
      </button>
    </div>
  </div>;
}
