"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, RotateCcw, X } from "lucide-react";

import { EXPORT_RETURN_REASONS, EXPORT_REVIEW_QUESTIONS, type ExportReviewQuestionKey } from "@/lib/crm/export-review";
import { quickApproveExportAction, quickReturnExportAction } from "../../actions";

type Answer = "yes" | "no" | null;

/** Ba câu Có/Không và hai nút. Có câu "Không" thì nút Duyệt khoá lại và gợi ý Trả lại. */
export function DecisionPanel({ kind, id, canDecide, summary, supplierHref }: {
  kind: "submission" | "verification"; id: string; canDecide: boolean; summary: string; supplierHref: string;
}) {
  const [answers, setAnswers] = useState<Record<ExportReviewQuestionKey, Answer>>({ company_match: null, shipment_info: null, readable: null });
  const [mode, setMode] = useState<"decide" | "return">("decide");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const allYes = EXPORT_REVIEW_QUESTIONS.every((q) => answers[q.key] === "yes");
  const anyNo = EXPORT_REVIEW_QUESTIONS.some((q) => answers[q.key] === "no");

  async function send(action: typeof quickApproveExportAction, fields: Record<string, string>) {
    if (busy) return;
    setBusy(true); setResult(null);
    const fd = new FormData();
    fd.set("kind", kind); fd.set("id", id);
    for (const [key, value] of Object.entries(fields)) fd.set(key, value);
    try {
      // Không tải lại trang khi thành công: hồ sơ đã xử lý sẽ đổi sang trang "đã xử lý"
      // và người dùng mất thông báo. Bảng kết quả bên dưới dẫn sang việc tiếp theo.
      setResult(await action(fd));
    } catch {
      setResult({ ok: false, message: "Mất kết nối. Tải lại trang và thử lại." });
    } finally { setBusy(false); }
  }

  if (result?.ok) return <aside className="card space-y-3 p-5 lg:sticky lg:top-24" aria-label="Quyết định">
    <p role="status" className="flex items-start gap-2 rounded-lg bg-success-surface p-3 text-[14px] font-semibold text-success"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{result.message}</p>
    <Link href="/crm/tasks" className="btn btn-primary w-full justify-center">Làm việc tiếp theo</Link>
    <Link href={supplierHref} className="btn btn-ghost w-full justify-center">Xem hồ sơ nhà cung cấp</Link>
  </aside>;

  return <aside className="card space-y-4 p-5 lg:sticky lg:top-24" aria-label="Quyết định">
    {!canDecide && <p className="rounded-lg bg-warning-surface p-3 text-[13px] text-ink-800">Bạn xem được hồ sơ nhưng chỉ quản trị viên hoặc trưởng kiểm duyệt mới bấm Duyệt hoặc Trả lại.</p>}

    {mode === "decide" ? <>
      <div>
        <h2 className="text-[15px] font-bold text-ink-900">Sau khi xem tệp</h2>
        <ol className="mt-3 space-y-3">
          {EXPORT_REVIEW_QUESTIONS.map((q, index) => <li key={q.key}>
            <p className="text-[14px] font-medium text-ink-800">{index + 1}. {q.text}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-label={q.text}>
              {(["yes", "no"] as const).map((value) => {
                const on = answers[q.key] === value;
                return <button key={value} type="button" role="radio" aria-checked={on} disabled={!canDecide || busy}
                  onClick={() => setAnswers((a) => ({ ...a, [q.key]: value }))}
                  className={"inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[14px] font-semibold transition disabled:opacity-50 " +
                    (on ? value === "yes" ? "border-success bg-success-surface text-success" : "border-error bg-error-surface text-error" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>
                  {value === "yes" ? <Check className="h-4 w-4" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}{value === "yes" ? "Có" : "Không"}
                </button>;
              })}
            </div>
          </li>)}
        </ol>
      </div>

      {anyNo && <p className="rounded-lg bg-warning-surface p-3 text-[13px] text-ink-800">Có câu trả lời Không, nên chưa duyệt được. Bấm Trả lại để nhà cung cấp sửa.</p>}

      <details className="rounded-lg bg-ink-50 p-3 text-[13px] text-ink-700">
        <summary className="cursor-pointer font-semibold text-ink-800">Người mua sẽ thấy câu này khi duyệt</summary>
        <p className="mt-2 leading-5">{summary}</p>
      </details>

      <div className="grid gap-2">
        <button type="button" className="btn btn-primary w-full justify-center py-3 text-[15px]" disabled={!canDecide || !allYes || busy}
          onClick={() => void send(quickApproveExportAction, Object.fromEntries(EXPORT_REVIEW_QUESTIONS.map((q) => [`q:${q.key}`, answers[q.key] ?? ""])))}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}Duyệt
        </button>
        <button type="button" className="btn btn-ghost w-full justify-center py-3 text-[15px]" disabled={!canDecide || busy} onClick={() => { setMode("return"); setResult(null); }}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />Trả lại
        </button>
      </div>
    </> : <>
      <div>
        <h2 className="text-[15px] font-bold text-ink-900">Vì sao trả lại?</h2>
        <p className="mt-1 text-[13px] text-ink-600">Bấm chọn một lý do, hoặc tự ghi. Nhà cung cấp sẽ nhận đúng câu này.</p>
        <ul className="mt-3 space-y-2">
          {EXPORT_RETURN_REASONS.map((text) => <li key={text}>
            <button type="button" onClick={() => setReason(text)} disabled={busy}
              className={"w-full rounded-lg border px-3 py-2 text-left text-[13.5px] transition " + (reason === text ? "border-brand-500 bg-brand-50 text-brand-900" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300")}>{text}</button>
          </li>)}
        </ul>
        <label className="mt-3 block text-[13px] font-semibold text-ink-700">Hoặc tự ghi lý do
          <textarea className="input mt-1" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <div className="grid gap-2">
        <button type="button" className="btn btn-primary w-full justify-center py-3 text-[15px]" disabled={!canDecide || busy || reason.trim().length < 8}
          onClick={() => void send(quickReturnExportAction, { reason })}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}Gửi lý do và trả lại
        </button>
        <button type="button" className="btn btn-ghost w-full justify-center" disabled={busy} onClick={() => setMode("decide")}>Quay lại</button>
      </div>
    </>}

    {result && !result.ok && <p role="alert" className="rounded-lg bg-error-surface p-3 text-[13px] text-error">{result.message}</p>}
  </aside>;
}
