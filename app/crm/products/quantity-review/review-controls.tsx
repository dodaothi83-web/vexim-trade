"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideQuantityRevisionAction } from "./actions";

export function QuantityReviewControls({ productId, revisionId, updatedAt, kind, approvalDisabled = false }: { productId: string; revisionId: string; updatedAt: string; kind: "price" | "name"; approvalDisabled?: boolean }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  async function decide(decision: "approve" | "reject") {
    if (busy || completed || (decision === "approve" && approvalDisabled)) return;
    if (decision === "reject" && !note.trim()) { setMessage({ ok: false, message: "Nhập lý do trước khi từ chối." }); return; }
    const form = new FormData();
    form.set("product_id", productId); form.set("revision_id", revisionId);
    form.set("product_updated_at", updatedAt); form.set("kind", kind); form.set("decision", decision); form.set("note", note);
    setBusy(true); setMessage(null);
    try {
      const result = await decideQuantityRevisionAction(form);
      setMessage(result);
      if (result.ok) { setCompleted(true); router.refresh(); }
    } catch { setMessage({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-5 border-t border-ink-100 pt-4" aria-busy={busy}>
    {completed ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message?.message}</p> : <>
      {rejecting && <label className="mb-3 block text-sm font-semibold text-ink-700">Lý do từ chối <span className="text-rose-600">*</span>
        <textarea autoFocus required aria-required="true" className="input mt-2 w-full font-normal" placeholder="Nêu rõ nội dung cần nhà cung cấp điều chỉnh…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} disabled={busy} />
        <span className="mt-1 block text-xs font-normal text-ink-500">Bắt buộc khi từ chối · tối đa 1.000 ký tự</span>
      </label>}
      <div className="flex flex-wrap items-center gap-3">
        {rejecting ? <>
          <button type="button" className="btn btn-primary disabled:opacity-50" disabled={busy || !note.trim()} onClick={() => void decide("reject")}>{busy ? "Đang xử lý…" : "Xác nhận từ chối"}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setRejecting(false); setMessage(null); }}>Hủy</button>
        </> : <>
          <button type="button" className="btn btn-primary disabled:opacity-50" disabled={busy || approvalDisabled} onClick={() => void decide("approve")}>{busy ? "Đang xử lý…" : `Duyệt ${kind === "price" ? "giá" : "tên"}`}</button>
          <button type="button" className="btn btn-ghost text-ink-600" disabled={busy} onClick={() => { setRejecting(true); setMessage(null); }}>Từ chối đề xuất</button>
        </>}
      </div>
      {message && <p role={message.ok ? "status" : "alert"} className={`mt-3 text-sm ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.message}</p>}
    </>}
  </div>;
}
