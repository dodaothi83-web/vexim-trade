"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestProductFormChangesAction } from "@/app/crm/products/product-form-review-actions";
import { approveProductFormAction } from "@/app/crm/products/product-form-approval-action";
import { suggestProductFormEnglishNameAction } from "@/app/crm/products/product-form-translation-actions";

export function ProductFormReviewControls({ productId, submissionId, updatedAt, allowApproval = false }: { productId: string; submissionId: string; updatedAt: string; allowApproval?: boolean }) {
  const router = useRouter();
  const [englishName, setEnglishName] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function translate() {
    setBusy(true); setMessage(null);
    try {
      const result = await suggestProductFormEnglishNameAction(productId, submissionId);
      if (!result.ok) { setMessage({ ok: false, text: result.message }); return; }
      setEnglishName(result.englishName);
      setMessage({ ok: true, text: result.nameNeedsEdit ? "Tên gợi ý có thể chứa grade. Hãy sửa trước khi duyệt." : "Đã tạo gợi ý. Tên này chưa được lưu hoặc công bố." });
    } catch { setMessage({ ok: false, text: "Không tạo được gợi ý. Hãy thử lại." }); }
    finally { setBusy(false); }
  }
  async function approve() {
    if (!englishName.trim() || englishName.length > 180) { setMessage({ ok: false, text: "Nhập tên tiếng Anh trước khi duyệt." }); return; }
    setBusy(true); setMessage(null);
    const form = new FormData(); form.set("product_id", productId); form.set("submission_id", submissionId); form.set("english_name", englishName);
    try {
      const result = await approveProductFormAction(form);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.push("/crm/products/form-review");
    } catch { setMessage({ ok: false, text: "Không xác nhận được kết quả duyệt. Hãy tải lại trang." }); }
    finally { setBusy(false); }
  }
  async function requestChanges() {
    if (!note.trim() || note.trim().length > 1000) { setMessage({ ok: false, text: "Nhập lý do chỉnh sửa, tối đa 1.000 ký tự." }); return; }
    setBusy(true); setMessage(null);
    const form = new FormData(); form.set("product_id", productId); form.set("submission_id", submissionId);
    form.set("product_updated_at", updatedAt); form.set("note", note);
    try {
      const result = await requestProductFormChangesAction(form);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    } catch { setMessage({ ok: false, text: "Không xác nhận được kết quả. Hãy tải lại trang." }); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
    <h2 className="font-semibold text-ink-900">Tên tiếng Anh và yêu cầu chỉnh sửa</h2>
    <div className="space-y-2"><label htmlFor="review-english-name" className="block text-sm font-medium">Tên tiếng Anh dự kiến</label>
      <div className="flex flex-wrap gap-2"><input id="review-english-name" className="input min-w-0 flex-1" maxLength={180}
        value={englishName} onChange={(event) => setEnglishName(event.target.value)} disabled={busy} />
        <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void translate()}>Gợi ý bằng AI</button></div>
      <p className="text-xs text-ink-500">Tên dự kiến chưa được lưu hoặc công bố.{!allowApproval && " Chức năng duyệt đang hoàn thiện."}</p>
      {allowApproval && <button type="button" className="btn btn-primary" disabled={busy || !englishName.trim()} onClick={() => void approve()}>Duyệt và công bố</button>}</div>
    <div className="space-y-2"><label htmlFor="review-note" className="block text-sm font-medium">Lý do yêu cầu NCC chỉnh sửa</label>
      <textarea id="review-note" className="input min-h-24 w-full" maxLength={1000} value={note} disabled={busy}
        onChange={(event) => setNote(event.target.value)} />
      <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void requestChanges()}>Yêu cầu chỉnh sửa</button></div>
    {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </section>;
}
