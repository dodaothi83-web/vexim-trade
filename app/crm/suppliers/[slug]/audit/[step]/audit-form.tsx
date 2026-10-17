"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw, Save, Send, Sparkles } from "lucide-react";

import type { MediaAsset, Verification } from "@/lib/types";
import type { AiDocumentReview } from "@/lib/ai/document-audit";
import { auditItems, auditStep } from "@/lib/verification";
import { Button, formatDate } from "@/components/ui";
import { approveVerificationAction, returnVerificationAction, updateVerificationChecklistAction } from "../../verification-actions";

export function AuditForm({ verification: v, evidence, aiEnabled, canApprove, currentUserId, requireSecondReviewer }: {
  verification: Verification; evidence: MediaAsset[]; aiEnabled: boolean; canApprove: boolean; currentUserId: string; requireSecondReviewer: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [reason, setReason] = useState("");
  const [scanning, setScanning] = useState(false);
  const [aiResult, setAiResult] = useState<(AiDocumentReview & { skipped: string[] }) | null>(null);
  const editable = ["in_progress", "scheduled", "returned"].includes(v.status);
  const selfReview = currentUserId === v.inspector_id;
  const reviewer = canApprove && v.status === "submitted" && (!requireSecondReviewer || !selfReview);
  const items = auditItems(v.target_level);
  const readableEvidence = evidence.filter((m) => m.storage_path && ["document", "certificate", "image"].includes(m.kind));
  const evidenceFingerprint = readableEvidence.map((m) => `${m.id}:${m.storage_path}`).join("|");
  const previousEvidence = useRef(evidenceFingerprint);
  useEffect(() => {
    if (previousEvidence.current !== evidenceFingerprint) {
      setAiResult(null); // A changed attachment set invalidates the earlier AI assessment.
      previousEvidence.current = evidenceFingerprint;
    }
  }, [evidenceFingerprint]);

  async function scanDocuments() {
    if (scanning || busy) return;
    if (!window.confirm("AI sẽ đọc ảnh/PDF nội bộ đã tải lên và gửi nội dung tệp tới nhà cung cấp AI để phân tích sơ bộ. Tiếp tục?")) return;
    const scannedFingerprint = evidenceFingerprint;
    setScanning(true); setFeedback(null); setAiResult(null);
    try {
      const response = await fetch(`/api/verifications/${encodeURIComponent(v.id)}/ai-review`, { method: "POST" });
      const data = await response.json() as (AiDocumentReview & { skipped: string[] }) & { message?: string };
      if (!response.ok || !Array.isArray(data.checks)) throw new Error(data.message || "AI chưa phân tích được tài liệu.");
      if (previousEvidence.current !== scannedFingerprint) throw new Error("Tệp đã thay đổi trong lúc AI phân tích. Hãy chạy lại.");
      setAiResult(data);
      setFeedback({ ok: true, message: "Đã có gợi ý AI. Xem dẫn chứng từng mục trước khi áp dụng; chưa có kết quả nào được lưu." });
    } catch (error) {
      setFeedback({ ok: false, message: error instanceof Error ? error.message : "Không chạy được AI. Vui lòng kiểm thủ công." });
    } finally { setScanning(false); }
  }

  function applySuggestions() {
    if (!ref.current || !aiResult) return;
    if (!window.confirm("Điền gợi ý có dẫn chứng vào các mục CHƯA kiểm? AI không xác thực giấy tờ thật hay cơ quan cấp. Bạn vẫn phải xem lại và tự bấm Lưu/Nộp duyệt.")) return;
    const available = new Set(evidence.map((m) => m.id));
    let count = 0;
    for (const check of aiResult.checks) {
      if (check.verdict === "uncertain" || !check.evidence_ids.some((id) => available.has(id))) continue;
      const select = ref.current.elements.namedItem(`check:${check.key}`) as HTMLSelectElement | null;
      const note = ref.current.elements.namedItem(`note:${check.key}`) as HTMLInputElement | null;
      if (!select || select.value) continue; // Never overwrite a human decision.
      select.value = check.verdict === "pass" ? "yes" : "no";
      if (note && !note.value.trim()) note.value = `AI sơ bộ: ${check.reason} (chưa xác thực nguồn cấp)`;
      count++;
    }
    setFeedback({ ok: true, message: `Đã điền nháp ${count} mục chưa kiểm. Hãy đối chiếu tệp và chỉnh sửa trước khi lưu.` });
  }

  async function run(action: () => Promise<{ ok: boolean; message: string }>) {
    if (busy) return;
    setBusy(true); setFeedback(null);
    try {
      const result = await action();
      setFeedback({ ok: result.ok, message: result.message });
      if (result.ok) router.refresh();
    } catch (error) {
      setFeedback({ ok: false, message: error instanceof Error ? error.message : "Không lưu được. Vui lòng thử lại." });
    } finally { setBusy(false); }
  }

  function save(status: "in_progress" | "submitted") {
    if (!ref.current) return;
    const fd = new FormData(ref.current);
    fd.set("id", v.id);
    fd.set("status", status);
    void run(() => updateVerificationChecklistAction(fd));
  }

  function decide(approve: boolean) {
    const fd = new FormData(); fd.set("id", v.id);
    if (!approve) {
      if (!reason.trim()) { setFeedback({ ok: false, message: "Hãy ghi lý do cần bổ sung." }); return; }
      fd.set("reason", reason);
    }
    if (approve && !window.confirm(`${selfReview ? "Bạn đang tự xác nhận bản kiểm của mình (chế độ tạm thời). Hãy tự đối chiếu lại chứng từ và kết quả. " : ""}Duyệt ${auditStep(v.target_level)?.title.toLowerCase()}? Bằng chứng sẽ được khóa${v.target_level < 3 ? " và bước tiếp theo sẽ mở" : ""}.`)) return;
    void run(() => approve ? approveVerificationAction(fd) : returnVerificationAction(fd));
  }

  return <div className="card overflow-hidden">
    <div className="border-b border-ink-100 px-5 py-4">
      <h2 className="text-base font-bold text-ink-900">Bảng kiểm & kết quả</h2>
      <p className="mt-1 text-sm text-ink-500">{items.length} mục · {items.filter((it) => v.checklist?.[it.key] === true || v.checklist?.[it.key] === false).length} mục đã ghi kết quả</p>
      {v.return_reason && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Cần bổ sung: {v.return_reason}</p>}
    </div>
    {v.target_level === 1 && editable && <section className="border-b border-brand-100 bg-brand-50/60 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><Sparkles className="h-4 w-4 text-brand-700" /> AI kiểm tra sơ bộ</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">Chỉ đọc ảnh/PDF trong card “Bằng chứng: Kiểm tra giấy tờ” của đợt kiểm này, không đọc kho chung NCC. Khi xác nhận, tệp được gửi tới OpenAI để gợi ý có dẫn chứng; không tự lưu hay duyệt.</p>
        </div>
        {aiEnabled && <Button type="button" size="sm" disabled={scanning || busy || readableEvidence.length === 0} onClick={() => void scanDocuments()}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {scanning ? "Đang đọc tài liệu…" : "AI kiểm giấy tờ"}
        </Button>}
      </div>
      {!aiEnabled && <p className="mt-2 text-xs text-amber-800">Chưa cấu hình AI trên máy chủ; vẫn có thể kiểm thủ công.</p>}
      {readableEvidence.length === 0 && <p className="mt-2 text-xs text-ink-600">Tải ảnh/PDF giấy tờ ở cột bên cạnh trước khi chạy AI.</p>}
      {aiResult && <div className="mt-3 rounded-lg border border-brand-200 bg-white p-3 text-sm text-ink-700">
        <p>{aiResult.summary || "AI đã đọc các tệp. Hãy kiểm từng gợi ý bên dưới."}</p>
        {aiResult.skipped.length > 0 && <p className="mt-2 text-xs text-amber-800">{aiResult.skipped.length} tệp chưa được AI đọc (vượt dung lượng/giới hạn hoặc không hỗ trợ). Không kết luận từ các tệp đó.</p>}
        <Button type="button" size="sm" className="mt-3" onClick={applySuggestions}>Điền nháp mục chưa kiểm</Button>
      </div>}
    </section>}
    <form ref={ref} onSubmit={(e) => { e.preventDefault(); save("in_progress"); }}>
      <fieldset disabled={!editable || busy}>
        <div className="divide-y divide-ink-100">
          {items.map((it, i) => {
            const suggestion = aiResult?.checks.find((c) => c.key === it.key);
            return <div key={it.key} className="space-y-2 px-5 py-4">
            <label htmlFor={`check-${it.key}`} className="block text-sm font-semibold text-ink-900">{i + 1}. {it.label}</label>
            <div className="grid gap-2 sm:grid-cols-[155px_minmax(0,1fr)]">
              <select id={`check-${it.key}`} name={`check:${it.key}`} defaultValue={v.checklist?.[it.key] === true ? "yes" : v.checklist?.[it.key] === false ? "no" : ""} className="input text-sm">
                <option value="">Chưa kiểm</option><option value="yes">Đạt</option><option value="no">Không đạt</option>
              </select>
              <input name={`note:${it.key}`} defaultValue={v.checklist_notes?.[it.key] ?? ""} className="input text-sm" placeholder="Ghi chú, mã chứng từ hoặc điểm cần đối chiếu" />
            </div>
            {suggestion && <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs leading-relaxed text-ink-700">
              <strong className={suggestion.verdict === "pass" ? "text-emerald-800" : suggestion.verdict === "fail" ? "text-rose-700" : "text-amber-800"}>
                AI: {suggestion.verdict === "pass" ? "Có vẻ phù hợp — cần đối chiếu" : suggestion.verdict === "fail" ? "Phát hiện điểm không khớp" : "Chưa đủ cơ sở"}
              </strong>{" · "}{suggestion.reason}
              {suggestion.evidence_ids.length > 0 && <span className="mt-1 block">Tệp tham chiếu: {suggestion.evidence_ids.map((id) => {
                const asset = evidence.find((m) => m.id === id && m.storage_path);
                return asset ? <a key={id} href={`/api/media/file/${asset.storage_path}`} target="_blank" rel="noreferrer" className="mr-2 font-semibold text-brand-700 underline">{asset.caption || "Mở tệp"}</a> : null;
              })}</span>}
            </div>}
          </div>;
          })}
        </div>
        {v.target_level === 2 && <div className="grid gap-3 border-t border-ink-100 bg-ink-50/40 p-5 sm:grid-cols-2">
          <Field label="Ngày thăm"><input type="date" name="visit_date" defaultValue={v.visit_date ?? ""} className="input" /></Field>
          <Field label="Địa chỉ cơ sở"><input name="visit_address" defaultValue={v.visit_address ?? ""} className="input" /></Field>
          <Field label="GPS vĩ độ"><input type="number" step="any" name="visit_lat" defaultValue={v.visit_lat ?? ""} className="input" /></Field>
          <Field label="GPS kinh độ"><input type="number" step="any" name="visit_lng" defaultValue={v.visit_lng ?? ""} className="input" /></Field>
        </div>}
        {v.target_level === 3 && <div className="grid gap-3 border-t border-ink-100 bg-ink-50/40 p-5 sm:grid-cols-2">
          <Field label="Mã đơn / lô hàng *"><input name="shipment_ref" defaultValue={v.shipment_ref ?? ""} className="input" placeholder="Mã để đối chiếu hồ sơ giao hàng" /></Field>
          <Field label="Ngày giao thực tế *"><input type="date" name="shipped_on" defaultValue={v.shipped_on ?? ""} className="input" /></Field>
          <Field label="Nơi giao / thị trường"><input name="shipment_destination" defaultValue={v.shipment_destination ?? ""} className="input" /></Field>
        </div>}
        <div className="space-y-3 border-t border-ink-100 p-5">
          <Field label="Ghi chú nội bộ"><textarea name="internal_notes" rows={3} defaultValue={v.internal_notes ?? ""} className="input" /></Field>
          <Field label="Tóm tắt công khai (tiếng Anh)"><textarea name="public_summary_en" rows={2} defaultValue={v.public_summary_i18n?.en ?? ""} className="input" placeholder="Chỉ nêu những thông tin đã đối chiếu, không ghi dữ liệu nhạy cảm." /></Field>
        </div>
      </fieldset>
      {editable && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-white p-4">
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu bản kiểm</Button>
        <Button type="button" variant="primary" disabled={busy} onClick={() => save("submitted")}><Send className="h-4 w-4" /> Nộp duyệt</Button>
      </div>}
    </form>
    {reviewer && <div className="space-y-3 border-t border-ink-100 bg-amber-50/50 p-5">
      <p className="text-sm font-semibold text-ink-900">Xét duyệt · xem cả bằng chứng ở cột bên cạnh</p>
      {selfReview && <p className="text-sm text-amber-900">Bạn đang xác nhận bản kiểm của chính mình (cho phép tạm thời với quyền quản trị). Hãy đối chiếu lại chứng từ trước khi duyệt; hệ thống ghi lại người kiểm và người duyệt.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" disabled={busy} onClick={() => decide(true)}><CheckCircle2 className="h-4 w-4" /> Duyệt & mở bước tiếp</Button>
        <Button type="button" disabled={busy} onClick={() => decide(false)}><RotateCcw className="h-4 w-4" /> Trả để bổ sung</Button>
      </div>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do trả (bắt buộc khi trả về)" aria-label="Lý do trả hồ sơ" />
    </div>}
    {canApprove && v.status === "submitted" && selfReview && requireSecondReviewer && <p className="border-t border-ink-100 p-4 text-sm text-amber-800">Bạn là người kiểm; cần người khác duyệt.</p>}
    {v.status === "approved" && <p className="border-t border-ink-100 p-4 text-sm text-emerald-800">Đã duyệt {v.approved_at ? formatDate(v.approved_at) : ""}. Kết quả và bằng chứng chỉ đọc.</p>}
    {feedback && <p role={feedback.ok ? "status" : "alert"} className={"border-t border-ink-100 p-4 text-sm " + (feedback.ok ? "text-emerald-700" : "text-rose-700")}>{feedback.message}</p>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-ink-700">{label}<span className="mt-1 block">{children}</span></label>;
}
