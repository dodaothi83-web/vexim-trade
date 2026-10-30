"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideQuantityRevisionAction } from "./actions";

export function QuantityReviewControls({ productId, revisionId, updatedAt, kind }: { productId: string; revisionId: string; updatedAt: string; kind: "price" | "name" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  async function decide(decision: "approve" | "reject") {
    if (busy) return;
    if (decision === "reject" && !note.trim()) { setMessage({ ok: false, message: "Nhập lý do trước khi từ chối." }); return; }
    const form = new FormData();
    form.set("product_id", productId); form.set("revision_id", revisionId);
    form.set("product_updated_at", updatedAt); form.set("kind", kind); form.set("decision", decision); form.set("note", note);
    setBusy(true); setMessage(null);
    try {
      const result = await decideQuantityRevisionAction(form);
      setMessage(result);
      if (result.ok) router.refresh();
    } catch { setMessage({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
    <label className="block text-xs font-semibold text-ink-700">Lý do từ chối (bắt buộc nếu từ chối)
      <textarea className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} disabled={busy} />
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void decide("approve")}>Duyệt {kind === "price" ? "giá" : "tên"}</button>
      <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => void decide("reject")}>Từ chối</button>
    </div>
    {message && <p role={message.ok ? "status" : "alert"} className={`text-xs ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.message}</p>}
  </div>;
}
