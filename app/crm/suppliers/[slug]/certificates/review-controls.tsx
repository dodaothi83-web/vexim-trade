"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { publishCertificateAction, reviewCertificateAction } from "./actions";

export function CertificateReviewControls({ id, status, visible, products, approvedIds, canReview, canPublish }: {
  id: string; status: string; visible: boolean; products: { id: string; name: string }[];
  approvedIds: string[]; canReview: boolean; canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function review(form: FormData) {
    setBusy(true); setMessage("");
    try { const response = await reviewCertificateAction(form); setMessage(response.message); if (response.ok) router.refresh(); }
    catch { setMessage("Không kết nối được máy chủ."); }
    finally { setBusy(false); }
  }
  async function publish(form: FormData) {
    setBusy(true); setMessage("");
    try { const response = await publishCertificateAction(form); setMessage(response.message); if (response.ok) router.refresh(); }
    catch { setMessage("Không kết nối được máy chủ."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-3">
    {canReview && (status === "pending" || status === "unreviewed") && <form action={review} className="rounded-xl border border-ink-200 bg-ink-50 p-4">
      <input type="hidden" name="certificate_id" value={id} />
      <p className="text-xs font-bold text-ink-800">Bước 1 · Kiểm tra bản sao, đơn vị đứng tên, phạm vi và hiệu lực. Chọn đúng sản phẩm được áp dụng; không tự công bố.</p>
      <fieldset className="mt-3"><legend className="text-xs font-semibold text-ink-700">Sản phẩm Vexim xác nhận áp dụng (cần ít nhất một sản phẩm để chấp thuận)</legend>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">{products.map((p) => <label key={p.id} className="flex items-center gap-2 text-sm"><input name="product_ids" type="checkbox" value={p.id} defaultChecked={approvedIds.includes(p.id)} />{p.name}</label>)}</div>
      </fieldset>
      <label className="mt-3 block text-xs font-semibold text-ink-700">Ghi chú / lý do yêu cầu bổ sung hoặc từ chối
        <textarea name="note" maxLength={1000} rows={2} className="input mt-1" placeholder="Ghi lại phạm vi đối chiếu và điểm cần làm rõ..." /></label>
      <label className="mt-3 flex items-start gap-2 text-xs font-medium text-ink-800"><input name="confirmed_review" type="checkbox" value="yes" className="mt-0.5" /> Tôi đã mở và tự đối chiếu bản sao với đơn vị đứng tên, tổ chức cấp, hạn và phạm vi của các sản phẩm tôi chọn. Đây không phải xác thực với cơ quan cấp.</label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" name="decision" value="approved" disabled={busy} className="btn btn-primary">Đã kiểm bản sao · chấp thuận</button>
        <button type="submit" name="decision" value="changes_requested" disabled={busy} className="btn btn-soft">Yêu cầu bổ sung</button>
        <button type="submit" name="decision" value="rejected" disabled={busy} className="btn btn-ghost">Không chấp thuận</button>
      </div>
    </form>}
    {canPublish && status === "approved" && <form action={publish} className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm">
      <input type="hidden" name="certificate_id" value={id} /><input type="hidden" name="visible" value={visible ? "no" : "yes"} />
      <p className="flex-1 text-ink-800"><strong>Bước 2 · {visible ? "Đã cho phép hiện" : "Chưa cho phép hiện"}.</strong> Bản PDF/ảnh gốc vẫn riêng tư; chỉ hiện tên/phạm vi/đơn vị đứng tên đã kiểm trên trang sản phẩm.</p>
      <button type="submit" disabled={busy} className="btn btn-primary">{visible ? "Thu hồi khỏi trang buyer" : "Cho phép hiện trên sản phẩm"}</button>
    </form>}
    {message && <p role="status" className="text-sm font-semibold text-ink-800">{message}</p>}
  </div>;
}
