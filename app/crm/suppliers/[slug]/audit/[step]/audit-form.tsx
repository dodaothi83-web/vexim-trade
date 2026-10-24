"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Loader2, LockKeyhole, RotateCcw, Save, Send, Sparkles } from "lucide-react";

import { L1_DOC_ITEMS, LEGACY_L2_VISIT_ITEMS, type AuditEvidenceKey, type Certificate, type MediaAsset, type Verification } from "@/lib/types";
import { prepareImage } from "@/lib/media/client-image";
import { readUploadResponse } from "@/lib/media/upload-response";
import type { AiDocumentReview } from "@/lib/ai/document-audit";
import { auditItems, auditStep, auditUploadKind } from "@/lib/verification";
import { Button, formatDate } from "@/components/ui";
import { FilePicker } from "@/components/file-picker";
import { addMediaLinkAction, deleteMediaAction, updateMediaAction } from "@/app/actions";
import { approveVerificationAction, assignVerificationEvidenceAction, returnVerificationAction, updateVerificationChecklistAction, updateVerificationPublicSummaryAction } from "../../verification-actions";
import { CertificateRowControls } from "./certificate-row-controls";

export function AuditForm({ verification: v, evidence, certificates = [], aiEnabled, canApprove, canInspect, canPublish = false, currentUserId, canSelfApprove }: {
  verification: Verification; evidence: MediaAsset[]; certificates?: Certificate[]; aiEnabled: boolean; canApprove: boolean; canInspect: boolean; canPublish?: boolean; currentUserId: string; canSelfApprove: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [reason, setReason] = useState("");
  const [publicSummary, setPublicSummary] = useState(v.public_summary_i18n?.en ?? "");
  const [summaryConfirmed, setSummaryConfirmed] = useState(false);
  // Supplier-uploaded reviews and same-person completion both require an
  // explicit re-check confirmation; the stored decision is marked self_approved.
  const [selfConfirm, setSelfConfirm] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [showOldEvidence, setShowOldEvidence] = useState(evidence.some((m) => !m.checklist_key));
  // UI lạc quan cho nút "Đánh dấu đã kiểm": đổi nhãn ngay khi bấm, hoàn tác nếu server lỗi.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, "checked" | "unverified">>({});
  const [markingId, setMarkingId] = useState<string | null>(null);
  const shownStatus = (asset: MediaAsset) => statusOverrides[asset.id] ?? asset.status;
  const [scanning, setScanning] = useState(false);
  const [aiResult, setAiResult] = useState<(AiDocumentReview & { skipped: string[] }) | null>(null);
  const editable = canInspect && ["in_progress", "scheduled", "returned"].includes(v.status);
  const selfReview = currentUserId === v.inspector_id;
  const selfApproval = selfReview && canSelfApprove;
  const reviewer = canApprove && v.status === "submitted" && (!selfReview || selfApproval);
  const canManageEvidence = editable;
  const items = auditItems(v.target_level);
  const summaryGuide = v.target_level === 2
    ? "Nêu ngày kiểm, khu vực cơ sở và các hạng mục đã kiểm tra. Chỉ mô tả cơ sở thuộc đợt kiểm này."
    : "Nêu giai đoạn, loại chứng từ và phạm vi lô hàng đã kiểm tra. Tách rõ thị trường do nhà cung cấp tự khai.";
  const requiredDocs = L1_DOC_ITEMS.filter((it) => it.required);
  const optionalDocs = L1_DOC_ITEMS.filter((it) => !it.required);
  const recorded = (key: string) => v.checklist?.[key] === true || v.checklist?.[key] === false || v.checklist?.[key] === "not_applicable";
  // Dữ liệu đợt kiểm L2 lập theo danh mục CŨ: giữ hiển thị read-only để đối soát, không xóa.
  const legacyL2 = v.target_level === 2
    ? LEGACY_L2_VISIT_ITEMS.filter((li) => recorded(li.key) || v.checklist_notes?.[li.key] || evidence.some((m) => (m.checklist_key as string | null) === li.key))
    : [];
  const unassignedEvidence = evidence.filter((m) => !m.checklist_key);
  const readableEvidence = evidence.filter((m) => m.storage_path && ["document", "certificate", "image"].includes(m.kind));
  const evidenceFingerprint = readableEvidence.map((m) => `${m.id}:${m.storage_path}:${m.status}`).join("|");
  const previousEvidence = useRef(evidenceFingerprint);
  const justScannedIds = useRef<string[] | null>(null);
  const scanInFlight = useRef(false);
  const aiConsent = useRef(false);
  useEffect(() => {
    if (previousEvidence.current !== evidenceFingerprint) {
      // Keep the fresh scan only if the uploaded files it cites really appeared.
      if (!justScannedIds.current?.every((id) => readableEvidence.some((m) => m.id === id))) setAiResult(null);
      justScannedIds.current = null;
      previousEvidence.current = evidenceFingerprint;
      // Props server đã về (kể cả status mới): bỏ các giá trị lạc quan.
      setStatusOverrides({});
    }
  }, [evidenceFingerprint]);

  async function scanDocuments(fileIds?: string[], consented = false, uploadWarning = "") {
    if (scanInFlight.current || (busy && !consented)) return;
    if (!consented && !window.confirm("AI sẽ đọc ảnh/PDF nội bộ của đúng đợt kiểm và gửi nội dung tệp tới nhà cung cấp AI để phân tích sơ bộ. Tiếp tục?")) return;
    scanInFlight.current = true;
    const scannedFingerprint = evidenceFingerprint;
    justScannedIds.current = null;
    setScanning(true); setFeedback(null); setAiResult(null);
    try {
      const response = await fetch(`/api/verifications/${encodeURIComponent(v.id)}/ai-review`, fileIds
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileIds: fileIds.slice(0, 6) }) }
        : { method: "POST" });
      const data = await response.json() as (AiDocumentReview & { skipped: string[] }) & { message?: string };
      if (!response.ok || !Array.isArray(data.checks)) throw new Error(data.message || "AI chưa phân tích được tài liệu.");
      if (!fileIds && previousEvidence.current !== scannedFingerprint) throw new Error("Tệp đã thay đổi trong lúc AI phân tích. Hãy chạy lại.");
      if (fileIds) justScannedIds.current = fileIds.slice(0, 6);
      setAiResult(data);
      setFeedback({ ok: !uploadWarning, message: (fileIds
        ? "Đã quét tệp vừa tải. Xem gợi ý ngay trong từng mục; AI không tự điền kết quả hay duyệt."
        : "Đã có gợi ý AI. Xem dẫn chứng từng mục trước khi áp dụng; chưa có kết quả nào được lưu.") + (uploadWarning ? ` ${uploadWarning}` : "") });
    } catch (error) {
      setFeedback({ ok: false, message: `${error instanceof Error ? error.message : "Không chạy được AI. Vui lòng kiểm thủ công."}${uploadWarning ? ` ${uploadWarning}` : ""} Tệp đã tải vẫn được giữ.` });
    } finally { scanInFlight.current = false; setScanning(false); }
  }

  function applySuggestions() {
    if (!ref.current || !aiResult) return;
    if (!window.confirm("Điền gợi ý có dẫn chứng vào các mục CHƯA kiểm? AI không xác thực giấy tờ thật hay cơ quan cấp. Bạn vẫn phải xem lại và tự bấm Lưu/Nộp duyệt.")) return;
    const available = new Set(evidence.map((m) => m.id));
    let count = 0;
    for (const check of aiResult.checks) {
      if (check.key === "tax_certificate" || check.key === "bank_letter" || check.verdict === "uncertain" || !check.evidence_ids.some((id) => available.has(id))) continue;
      const select = ref.current.elements.namedItem(`check:${check.key}`) as HTMLSelectElement | null;
      const note = ref.current.elements.namedItem(`note:${check.key}`) as HTMLInputElement | null;
      if (!select || select.value) continue; // Never overwrite a human decision.
      select.value = check.verdict === "pass" ? "yes" : "no";
      if (note && !note.value.trim()) note.value = `AI sơ bộ: ${check.reason} (chưa xác thực nguồn cấp)`;
      count++;
    }
    setFeedback({ ok: true, message: `Đã điền nháp ${count} mục chưa kiểm. Hãy đối chiếu tệp và chỉnh sửa trước khi lưu.` });
  }

  async function run(action: () => Promise<{ ok: boolean; message: string }>, assetId?: string) {
    if (busy) return;
    setBusy(true); setFeedback(null);
    if (assetId) setMarkingId(assetId);
    try {
      const result = await action();
      setFeedback({ ok: result.ok, message: result.message });
      if (result.ok) router.refresh();
    } catch (error) {
      setFeedback({ ok: false, message: error instanceof Error ? error.message : "Không lưu được. Vui lòng thử lại." });
    } finally { setBusy(false); setMarkingId(null); }
  }

  /** Bấm là đổi nhãn ngay (optimistic); server lỗi thì hoàn tác và báo đỏ. */
  async function toggleChecked(asset: MediaAsset) {
    if (!canManageEvidence || busy) return;
    const next = shownStatus(asset) === "checked" ? "unverified" : "checked";
    setStatusOverrides((o) => ({ ...o, [asset.id]: next }));
    setMarkingId(asset.id); setBusy(true); setFeedback(null);
    try {
      const result = await updateMediaAction(asset.id, { status: next });
      setFeedback({ ok: result.ok, message: result.message });
      if (result.ok) router.refresh();
      else setStatusOverrides((o) => { const c = { ...o }; delete c[asset.id]; return c; });
    } catch (error) {
      setStatusOverrides((o) => { const c = { ...o }; delete c[asset.id]; return c; });
      setFeedback({ ok: false, message: error instanceof Error ? error.message : "Không cập nhật được trạng thái kiểm tra." });
    } finally { setBusy(false); setMarkingId(null); }
  }

  function removeEvidence(asset: MediaAsset) {
    if (!canManageEvidence || !window.confirm(`Xóa hẳn tệp “${asset.caption || asset.id}” khỏi đợt kiểm?`)) return;
    void run(() => deleteMediaAction(asset.id), asset.id);
  }

  function addVideo() {
    if (!canManageEvidence || !videoUrl.trim()) return;
    void run(async () => {
      const result = await addMediaLinkAction({ ownerType: "verification", ownerId: v.id, url: videoUrl.trim(), caption: null, audience: "internal" });
      if (result.ok) setVideoUrl("");
      return result;
    });
  }

  async function uploadInline(key: AuditEvidenceKey, files: FileList | null) {
    const uploadKind = auditUploadKind(v.target_level, key);
    if (!uploadKind || !canManageEvidence || busy || !files?.length) return;
    const autoScan = v.target_level === 1 && aiEnabled && editable && (aiConsent.current || window.confirm(
      "Sau khi tải lên, ảnh/PDF sẽ được gửi đến dịch vụ AI để quét sơ bộ ngay. Nội dung có thể chứa dữ liệu nội bộ; AI không tự duyệt. Đồng ý tự quét? Chọn Hủy vẫn tải tệp nhưng không gửi tới AI.",
    ));
    if (autoScan) aiConsent.current = true;
    setBusy(true); setFeedback(null);
    let uploaded = 0;
    const createdIds: string[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (uploadKind === "image" && pdf) throw new Error("Mục này chỉ nhận ảnh.");
        const form = new FormData();
        form.set("ownerType", "verification");
        form.set("ownerId", v.id);
        form.set("checklistKey", key);
        form.set("kind", pdf ? "document" : "image");
        form.set("audience", "internal");
        let upload = file;
        if (!pdf) {
          const prepared = await prepareImage(file);
          upload = new File([prepared.main], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
          form.set(`thumb:${upload.name}`, new File([prepared.thumb], "thumb.jpg", { type: "image/jpeg" }), "thumb.jpg");
          form.set(`width:${upload.name}`, String(prepared.width));
          form.set(`height:${upload.name}`, String(prepared.height));
        }
        form.set("files", upload, upload.name);
        const response = await fetch("/api/media/upload", { method: "POST", body: form });
        const result = await readUploadResponse<{ created?: string[]; results?: { ok: boolean; message: string }[]; message?: string }>(response);
        if (!response.ok || !result.results?.some((r) => r.ok) || !result.created?.length) throw new Error(result.results?.[0]?.message ?? result.message ?? `HTTP ${response.status}`);
        createdIds.push(...result.created);
        uploaded++;
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : "Không tải lên được."}`);
      }
    }
    const uploadWarning = [...errors, ...(createdIds.length > 6 ? [`Chỉ 6/${createdIds.length} tệp mới được quét trong lượt này; có thể quét lại sau.`] : [])].join(" ");
    setFeedback({ ok: !uploadWarning, message: [uploaded ? `Đã tải ${uploaded} tệp vào mục kiểm.` : "", uploadWarning].filter(Boolean).join(" ") });
    if (uploaded) router.refresh();
    if (autoScan && createdIds.length) await scanDocuments(createdIds.slice(0, 6), true, uploadWarning);
    setBusy(false);
  }

  function save(status: "in_progress" | "submitted") {
    if (!ref.current) return;
    const fd = new FormData(ref.current);
    fd.set("id", v.id);
    fd.set("status", status);
    void run(() => updateVerificationChecklistAction(fd));
  }

  function savePublicSummary(mode: "draft" | "publish" | "hide") {
    const fd = new FormData();
    fd.set("id", v.id); fd.set("mode", mode); fd.set("summary", publicSummary);
    if (summaryConfirmed) fd.set("confirmed", "yes");
    if (mode === "publish" && !window.confirm("Duyệt và công khai bản tóm tắt này trên trang NCC? Không công khai chứng từ.")) return;
    void run(() => updateVerificationPublicSummaryAction(fd));
  }

  function decide(approve: boolean) {
    const fd = new FormData(); fd.set("id", v.id);
    if (approve && (!v.inspector_id || selfApproval)) fd.set("confirm_self_review", selfConfirm ? "yes" : "no");
    if (approve && v.target_level > 1) {
      if (!publicSummary.trim() || !summaryConfirmed) {
        setFeedback({ ok: false, message: "Hãy điền tóm tắt công khai và xác nhận đã đối chiếu trước khi duyệt." });
        return;
      }
      fd.set("public_summary", publicSummary.trim());
      fd.set("confirm_public_summary", "yes");
    }
    if (!approve) {
      if (!reason.trim()) { setFeedback({ ok: false, message: "Hãy ghi lý do cần bổ sung." }); return; }
      fd.set("reason", reason);
    }
    if (approve && !window.confirm(`Duyệt ${auditStep(v.target_level)?.title.toLowerCase()}? Bằng chứng sẽ được khóa${v.target_level < 3 ? " và bước tiếp theo sẽ mở" : ""}.${v.target_level > 1 ? " Tóm tắt sẽ công khai cùng kết quả; bằng chứng gốc vẫn riêng tư." : ""}`)) return;
    void run(() => approve ? approveVerificationAction(fd) : returnVerificationAction(fd));
  }

  return <div className="card overflow-hidden">
    <div className="border-b border-ink-100 px-5 py-4">
      <h2 className="text-base font-bold text-ink-900">Bảng kiểm & kết quả</h2>
      <p className="mt-1 text-sm text-ink-500">{v.target_level === 1
        ? `${requiredDocs.filter((it) => it.key === "tax_certificate" ? !!v.tax_number : recorded(it.key)).length}/${requiredDocs.length} mục bắt buộc đã ghi · ${optionalDocs.filter((it) => it.key === "bank_letter" ? !!v.bank_account_number : recorded(it.key)).length}/${optionalDocs.length} mục tùy chọn`
        : `${items.filter((it) => recorded(it.key)).length}/${items.length} mục đã ghi · không bắt buộc điền hết`}</p>
      {v.target_level > 1 && <p className="mt-1 text-xs text-ink-600">{v.target_level === 2 ? "Để duyệt cần ít nhất một ảnh thực tế của đúng đợt kiểm." : "Để duyệt cần chứng từ vận chuyển/giao nhận gắn đúng mục, hoặc chứng từ cũ đã kiểm tra."} Lưu và nộp có thể để trống các ô khác.</p>}
      {v.return_reason && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Cần bổ sung: {v.return_reason}</p>}
      {busy && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-brand-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xử lý…</p>}
      {feedback && <p role={feedback.ok ? "status" : "alert"} className={"mt-3 rounded-lg px-3 py-2 text-sm " + (feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>{feedback.message}</p>}
    </div>
    {v.target_level === 1 && editable && <section className="border-b border-brand-100 bg-brand-50/60 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><Sparkles className="h-4 w-4 text-brand-700" /> AI kiểm tra sơ bộ</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">Chèn ảnh/PDF ngay trong mục bên dưới. Nếu đồng ý, tệp mới sẽ được quét ngay; hoặc bấm quét lại các tệp thuộc đợt kiểm này. Không đọc kho chung NCC. AI chỉ gợi ý, không tự lưu hay duyệt.</p>
        </div>
        {aiEnabled && <Button type="button" size="sm" disabled={scanning || busy || readableEvidence.length === 0} onClick={() => void scanDocuments()}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {scanning ? "Đang đọc tài liệu…" : "AI kiểm giấy tờ"}
        </Button>}
      </div>
      {!aiEnabled && <p className="mt-2 text-xs text-amber-800">Chưa cấu hình AI trên máy chủ; vẫn có thể kiểm thủ công.</p>}
      {readableEvidence.length === 0 && <p className="mt-2 text-xs text-ink-600">Chèn ảnh/PDF ở mục giấy tờ bên dưới trước khi quét.</p>}
      {aiResult && <div className="mt-3 rounded-lg border border-brand-200 bg-white p-3 text-sm text-ink-700">
        <p>{aiResult.summary || "AI đã đọc các tệp. Hãy kiểm từng gợi ý bên dưới."}</p>
        {aiResult.skipped.length > 0 && <p className="mt-2 text-xs text-amber-800">{aiResult.skipped.length} tệp chưa được AI đọc (vượt dung lượng/giới hạn hoặc không hỗ trợ). Không kết luận từ các tệp đó.</p>}
        <Button type="button" size="sm" className="mt-3" onClick={applySuggestions}>Điền nháp mục chưa kiểm</Button>
      </div>}
    </section>}
    <details className="border-b border-ink-100 bg-ink-50/60 px-5 py-3 text-sm" open={showOldEvidence} onToggle={(e) => setShowOldEvidence(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold text-ink-800">Tệp cũ chưa gắn mục & link video · {unassignedEvidence.length}</summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-ink-600">Tệp thuộc đúng đợt kiểm vẫn dùng được. Gắn vào dòng bên dưới để dễ đối chiếu; không cần tải lại. Tệp kho chung NCC không tự chuyển vào đây.</p>
        {unassignedEvidence.map((asset) => <div key={asset.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
          <a href={asset.storage_path ? `/api/media/file/${asset.storage_path}` : asset.external_url || "#"} target="_blank" rel="noreferrer" className="max-w-72 truncate font-medium text-brand-700 underline">{asset.caption || (asset.kind === "video" ? "Mở video" : "Mở tệp")}</a>
          {v.target_level > 1 && asset.storage_path && <span className={shownStatus(asset) === "checked" ? "text-xs text-emerald-700" : "text-xs text-ink-500"}>{shownStatus(asset) === "checked" ? "Đã kiểm tra" : "Chưa đánh dấu"}</span>}
          {canManageEvidence && v.target_level > 1 && asset.storage_path && <button type="button" disabled={busy} className="inline-flex items-center gap-1 text-xs text-brand-700 underline disabled:opacity-50" onClick={() => void toggleChecked(asset)}>
            {markingId === asset.id && <Loader2 className="h-3 w-3 animate-spin" />}{shownStatus(asset) === "checked" ? "Bỏ đánh dấu" : "Đánh dấu đã kiểm"}
          </button>}
          {canManageEvidence && asset.storage_path && ["image", "document", "certificate"].includes(asset.kind) && <select className="input w-auto py-1 text-xs" value="" disabled={busy} aria-label={`Gắn ${asset.caption || "tệp"} vào mục kiểm`} onChange={(e) => {
            const key = e.target.value as AuditEvidenceKey;
            if (key) void run(() => assignVerificationEvidenceAction(asset.id, key));
          }}>
            <option value="">Gắn vào mục…</option>
            {items.filter((it) => auditUploadKind(v.target_level, it.key as AuditEvidenceKey) === "file" ||
              (asset.kind === "image" && auditUploadKind(v.target_level, it.key as AuditEvidenceKey) === "image"))
              .map((it) => <option key={it.key} value={it.key}>{it.label}</option>)}
          </select>}
          {canManageEvidence && <button type="button" disabled={busy} className="ml-auto text-xs text-rose-700 underline" onClick={() => removeEvidence(asset)}>Xóa</button>}
        </div>)}
        {canManageEvidence && <div className="flex flex-wrap gap-2 pt-2">
          <input type="url" className="input min-w-48 flex-1 text-xs" placeholder="Link video YouTube/Drive (không thay giấy tờ)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
          <Button type="button" size="sm" disabled={busy || !videoUrl.trim()} onClick={addVideo}>Thêm link</Button>
        </div>}
      </div>
    </details>
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); save("in_progress"); }}>
        <div className="divide-y divide-ink-100">
          {items.map((it, i) => {
            const suggestion = aiResult?.checks.find((c) => c.key === it.key);
            const coreDoc = v.target_level === 1 && "core" in it && it.core;
            const optional = v.target_level > 1 || "required" in it && !it.required;
            const uploadKind = auditUploadKind(v.target_level, it.key as AuditEvidenceKey);
            const linked = evidence.filter((m) => m.checklist_key === it.key && m.storage_path);
            return <div key={it.key} className="space-y-2 px-5 py-4">
            <fieldset disabled={!editable || busy}>
              <label htmlFor={`check-${it.key}`} className="block text-sm font-semibold text-ink-900">
                {i + 1}. {it.label}{" "}
                {v.target_level === 2 && "requires_code" in it && it.requires_code && <span title="Ảnh NCC tự gửi phải kèm tờ giấy viết tay mã xác minh Vexim phát hành">🔖</span>}{" "}
                <span className={coreDoc ? "ml-1 text-xs font-semibold text-brand-700" : optional ? "ml-1 text-xs text-ink-500" : "ml-1 text-xs text-rose-700"}>{v.target_level === 2 ? "" : coreDoc ? "Bắt buộc 1 trong 3" : optional ? "Tùy chọn" : ["tax_certificate", "bank_letter"].includes(it.key) ? "Bắt buộc nhập" : "Bắt buộc đạt"}</span>
              </label>
              {v.target_level === 2 && "requirement" in it && <p className="mt-0.5 text-xs text-ink-500">
                {it.requirement} · đối chiếu ảnh NCC tự gửi cùng mục{("requires_code" in it && it.requires_code) ? " · 🔖 kiểm tra tờ mã viết tay trong ảnh" : ""}
              </p>}
              {v.target_level === 1 && (it.key === "tax_certificate" || it.key === "bank_letter") ? <div className="mt-2 space-y-1.5">
                <input id={`check-${it.key}`} name={it.key === "tax_certificate" ? "tax_number" : "bank_account_number"}
                  type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={it.key === "tax_certificate" ? 32 : 34}
                  defaultValue={it.key === "tax_certificate" ? v.tax_number ?? "" : v.bank_account_number ?? ""}
                  className="input max-w-sm text-sm" placeholder={it.key === "tax_certificate" ? "Nhập mã số thuế" : "Nhập số tài khoản"} />
                <p className="text-xs text-ink-500">Chỉ nhập chữ số, giữ nguyên số 0 ở đầu. Lưu nội bộ; không cần ảnh và không tự xác minh tính hợp lệ.</p>
                {v.checklist_notes?.[it.key] && <p className="text-xs text-ink-500">Ghi chú cũ: {v.checklist_notes[it.key]}</p>}
              </div> : <div className="mt-2 grid gap-2 sm:grid-cols-[155px_minmax(0,1fr)]">
                <select id={`check-${it.key}`} name={`check:${it.key}`} defaultValue={v.checklist?.[it.key] === true ? "yes" : v.checklist?.[it.key] === false ? "no" : v.checklist?.[it.key] === "not_applicable" ? "not_applicable" : ""} className="input text-sm">
                  <option value="">Chưa kiểm</option><option value="yes">Đạt</option><option value="no">Không đạt</option>
                  {optional && <option value="not_applicable">Không áp dụng</option>}
                </select>
                <input name={`note:${it.key}`} defaultValue={v.checklist_notes?.[it.key] ?? ""} className="input text-sm" placeholder="Ghi chú, dữ liệu đã đối chiếu (nếu có)" />
              </div>}
              {v.target_level === 2 && it.key === "factory_gate" && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Ngày thăm / ngày đối chiếu"><input type="date" name="visit_date" defaultValue={v.visit_date ?? ""} className="input" /></Field>
                <Field label="Địa chỉ cơ sở"><input name="visit_address" defaultValue={v.visit_address ?? ""} className="input" placeholder="Địa chỉ thực tế đã thăm" /></Field>
                <Field label="GPS vĩ độ"><input type="number" step="any" name="visit_lat" defaultValue={v.visit_lat ?? ""} className="input" /></Field>
                <Field label="GPS kinh độ"><input type="number" step="any" name="visit_lng" defaultValue={v.visit_lng ?? ""} className="input" /></Field>
              </div>}
              {v.target_level === 3 && it.key === "order_matched" && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Mã đơn / lô hàng"><input name="shipment_ref" defaultValue={v.shipment_ref ?? ""} className="input" placeholder="Mã đơn, nếu có" /></Field>
                <Field label="Ngày giao thực tế"><input type="date" name="shipped_on" defaultValue={v.shipped_on ?? ""} className="input" /></Field>
                <Field label="Nơi giao / thị trường"><input name="shipment_destination" defaultValue={v.shipment_destination ?? ""} className="input" /></Field>
              </div>}
            </fieldset>
            {v.target_level === 1 && coreDoc && <p className="text-xs text-ink-600">Chỉ cần đạt một trong ba giấy: Đăng ký doanh nghiệp, ATTP, hoặc HACCP/ISO/FSSC/Halal. Giấy phải đứng tên pháp nhân đã đăng ký; giấy của nhà máy đối tác không thay được giấy xác minh chính. AI không tự xác thực giấy tờ.</p>}
            {v.target_level === 1 && it.key === "business_license" && <p className="text-xs text-ink-600">Đối chiếu tên pháp nhân và mã số thuế trên giấy với hồ sơ NCC; nếu dùng tên thương mại khác, ghi rõ căn cứ trong ghi chú. Đánh dấu Không đạt khi tên không khớp.</p>}
            {v.target_level === 1 && ["food_safety", "haccp_or_brc", "product_certs", "export_license"].includes(it.key) && <div className="space-y-1.5">
              <p className="text-xs font-semibold text-teal-800">Nhận diện tự động</p>
              {certificates.filter((c) => c.checklist_key === it.key || (!c.checklist_key && it.key === "product_certs")).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/50 px-3 py-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 text-ink-700">
                    <strong className="text-ink-900">{c.name}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${c.holder_match === "owner" ? "bg-emerald-100 text-emerald-800" : c.holder_match === "partner" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700"}`}>
                      {c.holder_match === "owner" ? `Chính chủ${c.holder_name ? ` · ${c.holder_name}` : ""}` : c.holder_match === "partner" ? `Đơn vị đối tác: ${c.holder_name || "—"}` : "Chưa rõ đơn vị đứng tên"}
                    </span>
                    {c.valid_until && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">Hạn {c.valid_until}</span>}
                    {c.staff_hidden && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">Đang ẩn</span>}
                  </div>
                  <CertificateRowControls supplierId={v.supplier_id} certificateId={c.id} hasFile={Boolean(c.file_media_id)} staffHidden={Boolean(c.staff_hidden)} canInspect={canInspect} canPublish={canPublish} />
                </div>
              ))}
            </div>}
            {suggestion && <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs leading-relaxed text-ink-700">
              <strong className={suggestion.verdict === "pass" ? "text-emerald-800" : suggestion.verdict === "fail" ? "text-rose-700" : "text-amber-800"}>
                AI: {suggestion.verdict === "pass" ? "Có vẻ phù hợp — cần đối chiếu" : suggestion.verdict === "fail" ? "Phát hiện điểm không khớp" : "Chưa đủ cơ sở"}
              </strong>{" · "}{suggestion.reason}
              {suggestion.evidence_ids.length > 0 && <span className="mt-1 block">Tệp tham chiếu: {suggestion.evidence_ids.map((id) => {
                const asset = evidence.find((m) => m.id === id && m.storage_path);
                return asset ? <a key={id} href={`/api/media/file/${asset.storage_path}`} target="_blank" rel="noreferrer" className="mr-2 font-semibold text-brand-700 underline">{asset.caption || "Mở tệp"}</a> : null;
              })}</span>}
            </div>}
            {(uploadKind || linked.length > 0) && <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600">
                <span className="font-semibold">{uploadKind === "image" ? "Ảnh thực tế" : uploadKind === "file" ? "Ảnh/PDF đối chiếu" : "Tệp cũ"} · {linked.length} tệp</span>
              </div>
              {canManageEvidence && uploadKind && <FilePicker
                className="mt-2 bg-white"
                multiple
                busy={busy}
                accept={uploadKind === "image" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
                title={uploadKind === "image" ? "Chèn ảnh thực tế vào mục này" : "Chèn ảnh hoặc PDF đối chiếu"}
                hint={uploadKind === "image" ? "JPG, PNG hoặc WEBP, tối đa 8 MB mỗi ảnh. Chọn được nhiều ảnh." : "JPG, PNG hoặc PDF, tối đa 15 MB mỗi tệp. Chọn được nhiều tệp."}
                onPick={(files) => uploadInline(it.key as AuditEvidenceKey, files)}
              />}
              {/* Đợt đã nộp hoặc đã duyệt thì vẫn phải thấy rõ chỗ đính kèm nằm ở đâu,
                  thay vì một dòng chữ trống như thể thiếu giao diện. */}
              {!canManageEvidence && uploadKind && <div className="mt-2 flex items-start gap-2.5 rounded-lg border-2 border-dashed border-ink-200 bg-white/70 px-3 py-2.5 text-[11.5px] leading-4 text-ink-600">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden="true" />
                <span>
                  <strong className="block text-ink-800">{v.status === "approved" ? "Bằng chứng đã khóa" : v.status === "submitted" ? "Đang chờ duyệt, chưa nhận thêm tệp" : "Không có quyền thêm tệp"}</strong>
                  {v.status === "approved"
                    ? "Đợt kiểm đã duyệt nên không nhận tệp mới; hồ sơ đã duyệt giữ nguyên để đối chiếu."
                    : v.status === "submitted"
                      ? "Trả về để bổ sung nếu cần thêm ảnh hoặc PDF vào mục này."
                      : "Tài khoản của bạn không sửa được bằng chứng của đợt kiểm này."}
                </span>
              </div>}
              {linked.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{linked.map((asset) => <div key={asset.id} className="flex max-w-48 items-center gap-2 rounded-md border border-ink-200 bg-white p-1.5 text-xs">
                {asset.mime?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/media/file/${asset.thumb_path || asset.storage_path}`} alt={asset.caption || "Ảnh bằng chứng"} className="h-10 w-10 rounded object-cover" />
                ) : <FileText className="h-5 w-5 shrink-0 text-ink-500" />}
                <span className="min-w-0"><a href={`/api/media/file/${asset.storage_path}`} target="_blank" rel="noreferrer" className="block truncate font-semibold text-brand-700 underline">{asset.caption || "Mở tệp"}</a>
                  {v.target_level > 1 && <span className={shownStatus(asset) === "checked" ? "text-emerald-700" : "text-ink-500"}>{shownStatus(asset) === "checked" ? "Đã kiểm tra" : "Chưa đánh dấu kiểm tra"}</span>}
                  {canManageEvidence && <span className="flex flex-wrap gap-2">{v.target_level > 1 && <button type="button" disabled={busy} className="inline-flex items-center gap-1 text-brand-700 underline disabled:opacity-50" onClick={() => void toggleChecked(asset)}>
                    {markingId === asset.id && <Loader2 className="h-3 w-3 animate-spin" />}{shownStatus(asset) === "checked" ? "Bỏ đánh dấu" : "Đánh dấu đã kiểm"}
                  </button>}<button type="button" disabled={busy} className="inline-flex items-center gap-1 text-ink-500 underline disabled:opacity-50" onClick={() => void run(() => assignVerificationEvidenceAction(asset.id, null), asset.id)}>
                    {markingId === asset.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Bỏ gắn
                  </button><button type="button" disabled={busy} className="inline-flex items-center gap-1 text-rose-700 underline disabled:opacity-50" onClick={() => removeEvidence(asset)}>
                    {markingId === asset.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Xóa
                  </button></span>}
                </span>
              </div>)}</div>}
            </div>}
          </div>;
          })}
        </div>
        {v.target_level === 2 && legacyL2.length > 0 && <details className="border-b border-ink-100 bg-ink-50/60 px-5 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink-800">Danh mục L2 cũ (trước 20/10/2026) · {legacyL2.length} mục có dữ liệu</summary>
          <p className="mt-2 text-xs text-ink-600">Đợt kiểm này lập theo danh mục cũ nên dữ liệu cũ được giữ nguyên để đối soát (chỉ đọc). Đợt kiểm mới dùng danh mục 9 ảnh chung với cổng NCC tự gửi.</p>
          <ul className="mt-2 space-y-2">
            {legacyL2.map((li) => {
              const files = evidence.filter((m) => (m.checklist_key as string | null) === li.key && m.storage_path);
              return <li key={li.key} className="rounded-lg bg-white px-3 py-2 text-xs">
                <p className="font-semibold text-ink-800">{li.label} · {v.checklist?.[li.key] === true ? "Đạt" : v.checklist?.[li.key] === false ? "Không đạt" : v.checklist?.[li.key] === "not_applicable" ? "Không áp dụng" : "Chưa kiểm"}</p>
                {v.checklist_notes?.[li.key] && <p className="mt-0.5 text-ink-600">Ghi chú: {v.checklist_notes[li.key]}</p>}
                {files.length > 0 && <p className="mt-1 flex flex-wrap gap-2">{files.map((asset) => (
                  <a key={asset.id} href={`/api/media/file/${asset.storage_path}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">{asset.caption || "Mở tệp"}</a>
                ))}</p>}
              </li>;
            })}
          </ul>
        </details>}
        <fieldset disabled={!editable || busy}>
        <div className="space-y-3 border-t border-ink-100 p-5">
          <Field label="Ghi chú nội bộ"><textarea name="internal_notes" rows={3} defaultValue={v.internal_notes ?? ""} className="input" /></Field>
        </div>
      </fieldset>
      {editable && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-white p-4">
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu bản kiểm</Button>
        <Button type="button" variant="primary" disabled={busy} onClick={() => save("submitted")}><Send className="h-4 w-4" /> Nộp duyệt</Button>
      </div>}
    </form>
    {reviewer && <div className="space-y-3 border-t border-ink-100 bg-amber-50/50 p-5">
      <p className="text-sm font-semibold text-ink-900">Xét duyệt · đối chiếu bằng chứng ngay trong các mục bên trên</p>
      {selfApproval && <label className="flex items-start gap-2 rounded-lg bg-white/80 p-3 text-xs leading-relaxed text-ink-700">
        <input type="checkbox" className="mt-0.5" checked={selfConfirm} onChange={(e) => setSelfConfirm(e.target.checked)} />
        <span>Bạn đã kiểm và nộp đợt này. Tôi xác nhận đã tự đối chiếu lại bằng chứng và chịu trách nhiệm khi hoàn tất kiểm và duyệt một mình; hệ thống sẽ ghi dấu tự duyệt và lưu audit log.</span>
      </label>}
      {!v.inspector_id && <label className="flex items-start gap-2 rounded-lg bg-white/80 p-3 text-xs leading-relaxed text-ink-700">
        <input type="checkbox" className="mt-0.5" checked={selfConfirm} onChange={(e) => setSelfConfirm(e.target.checked)} />
        <span>Đợt này do nhà cung cấp tự tải giấy tờ lên nên chưa có người kiểm tách biệt. Tôi đã tự đối chiếu từng giấy tờ; hồ sơ sẽ ghi rõ một người vừa đối chiếu vừa duyệt.</span>
      </label>}

      {v.target_level > 1 && <section className="rounded-xl border border-sky-200 bg-white p-4" aria-label="Tóm tắt công khai khi duyệt">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink-900">Phạm vi buyer sẽ thấy</h3>
            <p className="mt-1 text-xs leading-5 text-ink-600">Viết 3 đến 5 dòng ngắn bằng tiếng Anh. Tóm tắt sẽ hiện ngay trong card xác minh khi bạn duyệt.</p>
          </div>
          <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-800">Bắt buộc</span>
        </div>
        <p className="mt-3 rounded-lg bg-sky-50/70 px-3 py-2 text-xs leading-5 text-ink-700">{summaryGuide}</p>
        <label className="mt-3 block text-sm font-medium text-ink-800">Tóm tắt công khai (tiếng Anh)
          <textarea className="input mt-1" rows={4} maxLength={1000} value={publicSummary}
            onChange={(e) => { setPublicSummary(e.target.value); setSummaryConfirmed(false); }}
            placeholder="Describe the review timing, evidence checked and scope in 3 to 5 short lines." />
        </label>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-[11px] leading-4 text-ink-500">
          <span>Không đưa chứng từ, tên buyer, giá, mã đơn, GPS hoặc thông tin liên hệ.</span>
          <span>{publicSummary.length}/1000</span>
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-ink-700">
          <input type="checkbox" className="mt-0.5" checked={summaryConfirmed} onChange={(e) => setSummaryConfirmed(e.target.checked)} />
          <span>Tôi đã đối chiếu tóm tắt với bằng chứng của đúng đợt kiểm, loại bỏ thông tin nhạy cảm và xác nhận đúng phạm vi đã kiểm tra.</span>
        </label>
      </section>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" disabled={busy || (v.target_level > 1 && (!publicSummary.trim() || !summaryConfirmed))} onClick={() => decide(true)}><CheckCircle2 className="h-4 w-4" /> Duyệt & mở bước tiếp</Button>
        <Button type="button" disabled={busy} onClick={() => decide(false)}><RotateCcw className="h-4 w-4" /> Trả để bổ sung</Button>
      </div>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do trả (bắt buộc khi trả về)" aria-label="Lý do trả hồ sơ" />
    </div>}
    {canApprove && v.status === "submitted" && selfReview && !selfApproval && <p className="border-t border-ink-100 p-4 text-sm text-amber-800">Bạn là người kiểm; cần người khác duyệt.</p>}
    {v.status === "approved" && <p className="border-t border-ink-100 p-4 text-sm text-emerald-800">Đã duyệt {v.approved_at ? formatDate(v.approved_at) : ""}.{v.self_approved && !v.inspector_id ? " Đợt do nhà cung cấp tự tải giấy tờ: người duyệt tự đối chiếu và duyệt một mình." : ""}{v.self_approved && v.inspector_id ? " Một nhân sự đã xác nhận tự đối chiếu và tự duyệt bản kiểm do chính mình thực hiện." : ""} Kết quả và bằng chứng chỉ đọc.</p>}
    {v.status === "approved" && v.target_level > 1 && <section className="border-t border-ink-200 bg-sky-50/40 p-5" aria-label="Tóm tắt công khai riêng">
      <h3 className="font-semibold text-ink-900">Tóm tắt công khai · {v.target_level === 2 ? "Thăm nhà máy" : "Lịch sử giao hàng"}</h3>
      <p className="mt-1 text-xs text-ink-600">Tóm tắt có thể được cập nhật hoặc ẩn tại đây. Chỉ người có quyền duyệt mới được soạn, duyệt hoặc ẩn tóm tắt. Không đăng chứng từ, tên buyer, giá, mã đơn hay GPS. Lịch sử giao hàng không mặc nhiên là xuất khẩu.</p>
      <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs leading-5 text-ink-600">{summaryGuide}</p>
      <p className="mt-2 text-xs font-semibold text-ink-700">{v.public_summary_published_at ? `Đang công khai · ${formatDate(v.public_summary_published_at)}` : "Chưa công khai"}</p>
      {canApprove ? <>
        <label className="mt-3 block text-sm font-medium text-ink-800">Nội dung buyer nhìn thấy (tiếng Anh)
          <textarea className="input mt-1" rows={3} maxLength={1000} value={publicSummary} onChange={(e) => { setPublicSummary(e.target.value); setSummaryConfirmed(false); }} placeholder="Only describe the specific evidence Vexim reviewed and its scope." />
        </label>
        <p className="mt-1 text-right text-[11px] text-ink-500">{publicSummary.length}/1000</p>
        <label className="mt-3 flex items-start gap-2 text-xs text-ink-700"><input type="checkbox" checked={summaryConfirmed} onChange={(e) => setSummaryConfirmed(e.target.checked)} />Tôi đã đối chiếu nội dung với bằng chứng của đúng đợt kiểm, loại bỏ thông tin nhạy cảm và xác nhận phạm vi phát biểu.</label>
        <div className="mt-3 flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => savePublicSummary("draft")}>Lưu nháp (ẩn)</Button><Button type="button" variant="primary" disabled={busy || !summaryConfirmed || !publicSummary.trim()} onClick={() => savePublicSummary("publish")}>Duyệt & công khai</Button>{v.public_summary_published_at && <Button type="button" disabled={busy} onClick={() => savePublicSummary("hide")}>Ẩn tóm tắt</Button>}</div>
      </> : v.public_summary_published_at && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-700">{v.public_summary_i18n?.en}</p>}
    </section>}
    {feedback && <p aria-hidden="true" className={"border-t border-ink-100 p-4 text-sm " + (feedback.ok ? "text-emerald-700" : "text-rose-700")}>{feedback.message}</p>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-ink-700">{label}<span className="mt-1 block">{children}</span></label>;
}
