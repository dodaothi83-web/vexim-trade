"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestProductFormChangesAction } from "@/app/crm/products/product-form-review-actions";
import { approveProductFormAction } from "@/app/crm/products/product-form-approval-action";
import { suggestProductFormEnglishNameAction } from "@/app/crm/products/product-form-translation-actions";

export function ProductFormReviewControls({ productId, submissionId, sourceName, updatedAt, allowApproval = false }: { productId: string; submissionId: string; sourceName: string; updatedAt: string; allowApproval?: boolean }) {
  const router = useRouter();
  const [englishName, setEnglishName] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [translationStatus, setTranslationStatus] = useState("AI đang dịch tên sản phẩm…");
  const edited = useRef(false);
  const request = useRef<{ key: string; promise: ReturnType<typeof suggestProductFormEnglishNameAction> } | null>(null);
  useEffect(() => {
    let current = true;
    const key = JSON.stringify([productId, submissionId, sourceName]);
    if (!request.current || request.current.key !== key) {
      if (request.current) { edited.current = false; setEnglishName(""); }
      request.current = { key, promise: suggestProductFormEnglishNameAction(productId, submissionId) };
    }
    setTranslationStatus("AI đang dịch tên sản phẩm…");
    void request.current.promise.then((result) => {
      if (!current) return;
      if (!result.ok) { setTranslationStatus(result.message); return; }
      if (result.submissionId !== submissionId || result.sourceName !== sourceName) {
        setTranslationStatus("Bản gửi đã thay đổi. Hãy tải lại trang trước khi duyệt."); return;
      }
      if (edited.current) { setTranslationStatus("Tên đã được nhập thủ công; bản dịch tự động không ghi đè."); return; }
      setEnglishName(result.englishName);
      setTranslationStatus(result.nameNeedsEdit ? "Tên AI có thể chứa grade. Hãy sửa trước khi duyệt." : "Tên AI dự kiến; hãy kiểm tra trước khi duyệt.");
    }).catch(() => { if (current) setTranslationStatus("Chưa dịch được tên. Anh có thể nhập tên tiếng Anh khi duyệt."); });
    return () => { current = false; };
  }, [productId, submissionId, sourceName]);
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
      <input id="review-english-name" className="input w-full" maxLength={180}
        value={englishName} onChange={(event) => { edited.current = true; setEnglishName(event.target.value); }} disabled={busy} />
      <p role="status" className="text-xs text-ink-600">{translationStatus}</p>
      <p className="text-xs text-ink-500">Tên dự kiến chưa được lưu hoặc công bố.{!allowApproval && " Chức năng duyệt đang hoàn thiện."}</p>
      {allowApproval && <button type="button" className="btn btn-primary" disabled={busy || !englishName.trim()} onClick={() => void approve()}>Duyệt và công bố</button>}</div>
    <div className="space-y-2"><label htmlFor="review-note" className="block text-sm font-medium">Lý do yêu cầu NCC chỉnh sửa</label>
      <textarea id="review-note" className="input min-h-24 w-full" maxLength={1000} value={note} disabled={busy}
        onChange={(event) => setNote(event.target.value)} />
      <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void requestChanges()}>Yêu cầu chỉnh sửa</button></div>
    {message && <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-emerald-700" : "text-rose-700"}`}>{message.text}</p>}
  </section>;
}
