"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Loader2, LockKeyhole, Save } from "lucide-react";
import { DownloadFactoryReport } from "@/components/download-factory-report";

import { L2_CALL_GROUPS, L2_PUBLIC_PHOTOS_MAX, L2_PUBLIC_PHOTOS_MIN, L2_REVIEW_METHOD_LABELS, type L2ReviewMethod, type MediaAsset, type SupplierSubmission, type Verification } from "@/lib/types";
import { callItems, callReviewBlockers, callReviewImages, formatVnDateTime, type CallReviewDraft } from "@/lib/l2-call-review";
import { prepareImage } from "@/lib/media/client-image";
import { readUploadResponse } from "@/lib/media/upload-response";
import { Button } from "@/components/ui";
import { FilePicker } from "@/components/file-picker";
import { deleteMediaAction, updateMediaAction } from "@/app/actions";
import { approveCallReviewAction, saveCallReviewAction } from "../../call-review-actions";

type Answer = "" | "seen" | "not_seen" | "na";

/** ISO UTC → giá trị `datetime-local` theo giờ Việt Nam. */
function isoToVnLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(Date.parse(iso) + 7 * 3600_000);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}
function vnLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function nowVnLocal(): string { return isoToVnLocal(new Date().toISOString()); }

/**
 * Form trưởng kiểm duyệt mở trong lúc gọi video / đi thực địa. Một người vừa ghi vừa
 * duyệt; nút Duyệt chỉ bật khi đủ điều kiện và đã tích cả hai ô xác nhận.
 */
export function CallReviewForm({ verification: v, evidence, canInspect, canApprove, inspectorName, booking }: {
  verification: Verification;
  evidence: MediaAsset[];
  canInspect: boolean;
  /** Có cả quyền kiểm và duyệt (trưởng kiểm duyệt / admin). */
  canApprove: boolean;
  /** Họ tên người đang đăng nhập hoặc người đã duyệt, lấy từ hồ sơ nhân sự. */
  inspectorName: string;
  booking: SupplierSubmission | null;
}) {
  const router = useRouter();
  const partner = v.l2_scope === "partner_contract";
  const items = useMemo(() => callItems(v.l2_scope), [v.l2_scope]);
  const editable = canInspect && ["scheduled", "in_progress", "returned", "submitted"].includes(v.status);
  const approved = v.status === "approved";

  const [method, setMethod] = useState<L2ReviewMethod>(partner ? "video_call" : v.review_method ?? "video_call");
  const [started, setStarted] = useState(isoToVnLocal(v.call_started_at));
  const [ended, setEnded] = useState(isoToVnLocal(v.call_ended_at));
  const [participants, setParticipants] = useState(v.supplier_participants ?? "");
  const [address, setAddress] = useState(v.visit_address ?? booking?.booking_factory_address ?? "");
  const [scale, setScale] = useState(v.observed_scale ?? "");
  const [partnerName, setPartnerName] = useState(v.partner_factory_name ?? "");
  const [internalNotes, setInternalNotes] = useState(v.internal_notes ?? "");
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(items.map((item) => {
    const value = v.checklist?.[item.key];
    return [item.key, value === true ? "seen" : value === false ? "not_seen" : value === "not_applicable" ? "na" : ""];
  })));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(items.map((item) => [item.key, v.checklist_notes?.[item.key] ?? ""])));
  const [publicIds, setPublicIds] = useState<string[]>(v.public_photo_ids ?? []);
  const [confirmPhotos, setConfirmPhotos] = useState(false);
  const [confirmObserved, setConfirmObserved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string; blockers?: string[] } | null>(null);

  const images = callReviewImages(v, evidence);
  const contracts = evidence.filter((m) => m.checklist_key === "partner_factory_contract" && m.storage_path);
  const shownPublic = publicIds.filter((id) => images.some((m) => m.id === id));

  const draft: CallReviewDraft = {
    review_method: method, call_started_at: vnLocalToIso(started), call_ended_at: vnLocalToIso(ended),
    supplier_participants: participants.trim() || null,
    checklist: Object.fromEntries(items.map((item) => [item.key, answers[item.key] === "seen" ? true : answers[item.key] === "not_seen" ? false : answers[item.key] === "na" ? "not_applicable" : null])),
    checklist_notes: Object.fromEntries(items.map((item) => [item.key, notes[item.key]?.trim() || null])),
    public_photo_ids: shownPublic,
    ...(partner ? { partner_factory_name: partnerName.trim() || null } : {}),
  };
  const blockers = callReviewBlockers({ draft, scope: v.l2_scope, media: evidence, verification: v, confirmations: { observed: confirmObserved, photos: confirmPhotos } });

  function formData(): FormData {
    const fd = new FormData();
    fd.set("id", v.id);
    fd.set("review_method", method);
    fd.set("call_started_at", started);
    fd.set("call_ended_at", ended);
    fd.set("supplier_participants", participants);
    fd.set("visit_address", address);
    fd.set("observed_scale", scale);
    fd.set("internal_notes", internalNotes);
    if (partner) fd.set("partner_factory_name", partnerName);
    for (const item of items) {
      fd.set(`check:${item.key}`, answers[item.key] ?? "");
      fd.set(`note:${item.key}`, notes[item.key] ?? "");
    }
    for (const id of shownPublic) fd.append("public_photo", id);
    if (confirmObserved) fd.set("confirm_observed", "yes");
    if (confirmPhotos) fd.set("confirm_photos", "yes");
    return fd;
  }

  async function run(work: () => Promise<{ ok: boolean; message: string; blockers?: string[] }>) {
    if (busy) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await work();
      setFeedback(result);
      if (result.ok) router.refresh();
    } catch (error) {
      setFeedback({ ok: false, message: error instanceof Error ? error.message : "Không lưu được. Thử lại." });
    } finally { setBusy(false); }
  }

  /** Lưu nháp trước khi tải ảnh để ảnh luôn gắn với đợt kiểm đã có dữ liệu mới nhất. */
  async function upload(key: string, files: FileList | null, kind: "image" | "file") {
    if (!editable || busy || !files?.length) return;
    setBusy(true); setFeedback(null);
    const errors: string[] = [];
    let uploaded = 0;
    for (const file of Array.from(files)) {
      try {
        const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (kind === "image" && pdf) throw new Error("Mục này chỉ nhận ảnh.");
        const form = new FormData();
        form.set("ownerType", "verification");
        form.set("ownerId", v.id);
        form.set("checklistKey", key);
        form.set("kind", pdf ? "document" : "image");
        form.set("audience", "internal");
        let body = file;
        if (!pdf) {
          const prepared = await prepareImage(file);
          body = new File([prepared.main], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
          form.set(`thumb:${body.name}`, new File([prepared.thumb], "thumb.jpg", { type: "image/jpeg" }), "thumb.jpg");
          form.set(`width:${body.name}`, String(prepared.width));
          form.set(`height:${body.name}`, String(prepared.height));
        }
        form.set("files", body, body.name);
        const response = await fetch("/api/media/upload", { method: "POST", body: form });
        const result = await readUploadResponse<{ created?: string[]; results?: { ok: boolean; message: string }[]; message?: string }>(response);
        if (!response.ok || !result.created?.length) throw new Error(result.results?.[0]?.message ?? result.message ?? `HTTP ${response.status}`);
        uploaded++;
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "không tải được"}`);
      }
    }
    setFeedback({ ok: errors.length === 0, message: [uploaded ? `Đã tải ${uploaded} tệp.` : "", ...errors].filter(Boolean).join(" ") });
    setBusy(false);
    if (uploaded) router.refresh();
  }

  function togglePublic(id: string) {
    setConfirmPhotos(false);
    setPublicIds((current) => current.includes(id) ? current.filter((x) => x !== id)
      : current.length >= L2_PUBLIC_PHOTOS_MAX ? current : [...current, id]);
  }

  function remove(asset: MediaAsset) {
    if (!window.confirm("Xóa hẳn ảnh/tệp này khỏi đợt kiểm?")) return;
    setPublicIds((current) => current.filter((id) => id !== asset.id));
    void run(() => deleteMediaAction(asset.id));
  }

  function approve() {
    if (blockers.length) return;
    if (!window.confirm(`Duyệt ${partner ? "nhà máy đối tác" : "xác thực nhà máy"} với tên người kiểm “${inspectorName}”? Sau khi duyệt, checklist và ảnh công khai bị khóa; người mua đăng nhập tải được báo cáo PDF.`)) return;
    void run(() => approveCallReviewAction(formData()));
  }

  const groups = [...new Set(items.map((item) => item.group))];

  return <div className="card overflow-hidden">
    <div className="border-b border-ink-100 px-5 py-4">
      <h2 className="text-base font-bold text-ink-900">{partner ? "Xác minh nhà máy đối tác qua cuộc gọi" : "Xác minh nhà máy qua cuộc gọi"}</h2>
      <p className="mt-1 text-sm text-ink-600">Gọi video trực tiếp hoặc đến thực địa, ghi kết quả từng mục và chụp màn hình ngay trong lúc gọi. Không chụp mặt công nhân vào ảnh công khai.</p>
      {booking && <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700 sm:grid-cols-2">
        <div><dt className="inline font-semibold">Lịch đã chốt: </dt><dd className="inline">{formatVnDateTime(booking.booking_scheduled_at) || "chưa ghi"}</dd></div>
        <div><dt className="inline font-semibold">Nhà cung cấp chọn: </dt><dd className="inline">{booking.booking_method ? L2_REVIEW_METHOD_LABELS[booking.booking_method].vi : "—"}</dd></div>
        <div><dt className="inline font-semibold">Người liên hệ: </dt><dd className="inline">{[booking.booking_contact_name, booking.booking_contact_role].filter(Boolean).join(" · ") || "—"}</dd></div>
        <div><dt className="inline font-semibold">Điện thoại / Zalo: </dt><dd className="inline">{booking.booking_contact_phone || "—"}</dd></div>
      </dl>}
      {busy && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-brand-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xử lý…</p>}
      {feedback && <div role={feedback.ok ? "status" : "alert"} className={"mt-3 rounded-lg px-3 py-2 text-sm " + (feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
        {feedback.message}
        {feedback.blockers?.length ? <ul className="mt-1 list-disc pl-5 text-xs">{feedback.blockers.map((b) => <li key={b}>{b}</li>)}</ul> : null}
      </div>}
    </div>

    <fieldset disabled={!editable || busy} className="space-y-0">
      <section className="grid gap-3 border-b border-ink-100 px-5 py-4 sm:grid-cols-2" aria-label="Thông tin buổi kiểm">
        <Field label="Phương thức">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as L2ReviewMethod)}>
            <option value="video_call">{L2_REVIEW_METHOD_LABELS.video_call.vi}</option>
            {!partner && <option value="on_site">{L2_REVIEW_METHOD_LABELS.on_site.vi}</option>}
          </select>
        </Field>
        <Field label="Người kiểm (từ hồ sơ nhân sự)"><input className="input bg-ink-50" value={inspectorName} readOnly /></Field>
        <Field label="Bắt đầu (giờ Việt Nam)">
          <span className="flex gap-2"><input type="datetime-local" className="input" value={started} onChange={(e) => setStarted(e.target.value)} />
            {editable && !started && <Button type="button" size="sm" onClick={() => setStarted(nowVnLocal())}>Bây giờ</Button>}</span>
        </Field>
        <Field label="Kết thúc (giờ Việt Nam)">
          <span className="flex gap-2"><input type="datetime-local" className="input" value={ended} onChange={(e) => setEnded(e.target.value)} />
            {editable && started && !ended && <Button type="button" size="sm" onClick={() => setEnded(nowVnLocal())}>Bây giờ</Button>}</span>
        </Field>
        <Field label="Người tham gia phía nhà cung cấp"><input className="input" value={participants} maxLength={400} onChange={(e) => setParticipants(e.target.value)} placeholder="Họ tên, chức vụ (ví dụ: Nguyễn Văn A · Giám đốc)" /></Field>
        <Field label="Địa chỉ nhà máy đã đối chiếu"><input className="input" value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} /></Field>
        {partner && <Field label="Tên nhà máy đối tác trên hợp đồng"><input className="input" value={partnerName} maxLength={200} onChange={(e) => setPartnerName(e.target.value)} /></Field>}
        <Field label="Quy mô quan sát được (tùy chọn)"><input className="input" value={scale} maxLength={400} onChange={(e) => setScale(e.target.value)} placeholder="Ví dụ: 2 dây chuyền, khoảng 40 công nhân" /></Field>
      </section>

      {partner && <section className="border-b border-ink-100 px-5 py-4" aria-label="Hợp đồng nhà máy đối tác">
        <h3 className="text-sm font-bold text-ink-900">Hợp đồng với nhà máy đối tác</h3>
        <p className="mt-1 text-xs text-ink-600">Tệp nhà cung cấp gửi khi đặt lịch đã được sao vào đây. Mở tệp, đối chiếu trong cuộc gọi rồi bấm “Đánh dấu đã kiểm”.</p>
        <ul className="mt-2 space-y-1.5">{contracts.map((asset) => <li key={asset.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-xs">
          <FileText className="h-4 w-4 text-ink-500" aria-hidden="true" />
          <a href={`/api/media/file/${asset.storage_path}`} target="_blank" rel="noreferrer" className="max-w-72 truncate font-semibold text-brand-700 underline">{asset.caption || "Mở hợp đồng"}</a>
          <span className={asset.status === "checked" ? "text-emerald-700" : "text-ink-500"}>{asset.status === "checked" ? "Đã kiểm" : "Chưa đánh dấu"}</span>
          {editable && <button type="button" className="text-brand-700 underline" onClick={() => void run(() => updateMediaAction(asset.id, { status: asset.status === "checked" ? "unverified" : "checked" }))}>{asset.status === "checked" ? "Bỏ đánh dấu" : "Đánh dấu đã kiểm"}</button>}
        </li>)}</ul>
        {editable && <FilePicker className="mt-2 bg-white" multiple busy={busy} accept="image/jpeg,image/png,image/webp,application/pdf"
          title="Thêm tệp hợp đồng" hint="Ảnh hoặc PDF, tối đa 15 MB." onPick={(files) => upload("partner_factory_contract", files, "file")} />}
      </section>}

      {groups.map((group) => <section key={group} className="border-b border-ink-100" aria-label={L2_CALL_GROUPS[group]?.vi}>
        <h3 className="bg-ink-50/70 px-5 py-2 text-xs font-bold uppercase tracking-wide text-ink-600">{group}. {L2_CALL_GROUPS[group]?.vi}</h3>
        <div className="divide-y divide-ink-100">{items.filter((item) => item.group === group).map((item) => {
          const linked = images.filter((m) => m.checklist_key === item.key);
          const canPhoto = item.group !== "E";
          return <div key={item.key} className="space-y-2 px-5 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-ink-900">{item.label} {item.required
                ? <span className="ml-1 text-xs font-semibold text-rose-700">Bắt buộc{item.photo ? " · cần ảnh" : ""}</span>
                : <span className="ml-1 text-xs text-ink-500">Tùy chọn</span>}</p>
            </div>
            <p className="text-xs text-ink-500">{item.hint}</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={item.label}>
              {([["seen", "Đã thấy"], ["not_seen", "Không thấy"], ...(item.required ? [] : [["na", item.foodOnly ? "Không áp dụng (không phải thực phẩm)" : "Không áp dụng"]])] as [Answer, string][]).map(([value, label]) =>
                <label key={value} className={"cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold " + (answers[item.key] === value
                  ? value === "seen" ? "border-emerald-400 bg-emerald-50 text-emerald-800" : value === "not_seen" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-ink-400 bg-ink-100 text-ink-800"
                  : "border-ink-200 bg-white text-ink-600")}>
                  <input type="radio" className="sr-only" name={`answer-${item.key}`} checked={answers[item.key] === value}
                    onChange={() => setAnswers((current) => ({ ...current, [item.key]: value }))} />{label}
                </label>)}
            </div>
            <input className="input text-sm" value={notes[item.key] ?? ""} maxLength={600}
              onChange={(e) => setNotes((current) => ({ ...current, [item.key]: e.target.value }))}
              placeholder={answers[item.key] === "na" ? "Lý do không áp dụng (bắt buộc)" : item.key === "live_random_request" ? "Đã yêu cầu quay gì, kết quả ra sao" : "Ghi chú nội bộ (tùy chọn)"} />
            {canPhoto && <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-2.5">
              {linked.length > 0 && <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{linked.map((asset) => {
                const chosen = shownPublic.includes(asset.id);
                return <figure key={asset.id} className={"overflow-hidden rounded-md border bg-white text-[11px] " + (chosen ? "border-brand-500 ring-2 ring-brand-200" : "border-ink-200")}>
                  <a href={`/api/media/file/${asset.storage_path}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/media/file/${asset.thumb_path || asset.storage_path}`} alt={item.label} className="aspect-[4/3] w-full object-cover" />
                  </a>
                  <figcaption className="flex flex-wrap items-center justify-between gap-1 px-1.5 py-1">
                    <label className="flex items-center gap-1 font-semibold text-ink-700">
                      <input type="checkbox" checked={chosen} disabled={!editable || (!chosen && shownPublic.length >= L2_PUBLIC_PHOTOS_MAX)} onChange={() => togglePublic(asset.id)} />
                      Báo cáo
                    </label>
                    {editable && <button type="button" className="text-rose-700 underline" onClick={() => remove(asset)}>Xóa</button>}
                  </figcaption>
                </figure>;
              })}</div>}
              {editable ? <FilePicker multiple compact busy={busy} accept="image/jpeg,image/png,image/webp"
                title="Thêm ảnh chụp màn hình / ảnh thực địa" hint="JPG, PNG hoặc WEBP. Ảnh lưu nội bộ; chỉ ảnh tích “Báo cáo” mới vào PDF người mua."
                onPick={(files) => upload(item.key, files, "image")} />
                : linked.length === 0 && <p className="text-[11px] text-ink-500">Không có ảnh.</p>}
            </div>}
          </div>;
        })}</div>
      </section>)}

      <section className="space-y-3 border-b border-ink-100 px-5 py-4">
        <Field label="Ghi chú nội bộ"><textarea className="input" rows={3} value={internalNotes} maxLength={5000} onChange={(e) => setInternalNotes(e.target.value)} /></Field>
      </section>
    </fieldset>

    {editable && <section className="space-y-3 bg-amber-50/50 px-5 py-4" aria-label="Xác nhận và duyệt">
      <p className="text-sm font-semibold text-ink-900">Ảnh cho báo cáo người mua: {shownPublic.length}/{L2_PUBLIC_PHOTOS_MAX} <span className="font-normal text-ink-600">(tối thiểu {L2_PUBLIC_PHOTOS_MIN}, xếp 2 ảnh một hàng trong PDF)</span></p>
      <label className="flex items-start gap-2 rounded-lg bg-white/80 p-3 text-xs leading-relaxed text-ink-700">
        <input type="checkbox" className="mt-0.5" checked={confirmPhotos} disabled={busy} onChange={(e) => setConfirmPhotos(e.target.checked)} />
        <span>Ảnh công khai không có mặt người nhận diện được, không lộ giá, mã lô, khách hàng hay màn hình tài liệu.</span>
      </label>
      <label className="flex items-start gap-2 rounded-lg bg-white/80 p-3 text-xs leading-relaxed text-ink-700">
        <input type="checkbox" className="mt-0.5" checked={confirmObserved} disabled={busy} onChange={(e) => setConfirmObserved(e.target.checked)} />
        <span>Tôi, <strong>{inspectorName}</strong>, đã trực tiếp quan sát các mục được đánh dấu Đã thấy trong {method === "on_site" ? "buổi kiểm thực địa" : "cuộc gọi"}{started ? ` ngày ${started.slice(8, 10)}/${started.slice(5, 7)}/${started.slice(0, 4)}` : ""}. Kết quả chỉ phản ánh những gì quan sát được tại thời điểm đó.</span>
      </label>
      {blockers.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-900" aria-label="Điều kiện còn thiếu để duyệt">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" disabled={busy} onClick={() => void run(() => saveCallReviewAction(formData()))}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu bản kiểm</Button>
        {canApprove && <Button type="button" variant="primary" disabled={busy || blockers.length > 0} onClick={approve}><CheckCircle2 className="h-4 w-4" /> Xác nhận &amp; duyệt</Button>}
      </div>
      {!canApprove && <p className="text-xs text-ink-600">Chỉ trưởng kiểm duyệt hoặc admin được duyệt đợt kiểm qua cuộc gọi.</p>}
    </section>}

    {approved && <section className="space-y-2 border-t border-emerald-100 bg-emerald-50/50 px-5 py-4 text-sm text-emerald-900">
      <p className="flex items-center gap-2 font-semibold"><LockKeyhole className="h-4 w-4" aria-hidden="true" /> Đã duyệt {formatVnDateTime(v.approved_at)} bởi {v.inspector_name}. Checklist và ảnh công khai đã khóa.</p>
      {v.report_code && <p>Mã báo cáo <strong>{v.report_code}</strong> · {shownPublic.length} ảnh công khai.</p>}
      {v.report_code && <p className="flex flex-wrap items-center gap-3">
        <DownloadFactoryReport code={v.report_code} signedIn nextPath="" label="Tải PDF người mua thấy" />
        <a href={`/verify/${encodeURIComponent(v.report_code)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 underline">Trang xác thực mã báo cáo</a>
        <span className="text-xs text-emerald-800">PDF chỉ tạo được khi hồ sơ nhà cung cấp đang công khai.</span>
      </p>}
    </section>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-ink-700">{label}<span className="mt-1 block font-normal">{children}</span></label>;
}
