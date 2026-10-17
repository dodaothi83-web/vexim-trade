"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CertificateSubmission({ products }: { products: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/supplier-portal/certificates", { method: "POST", body: new FormData(form) });
      const data = await response.json() as { ok?: boolean; message?: string };
      setMessage(data.message || "Không đọc được phản hồi.");
      if (response.ok && data.ok) { form.reset(); router.refresh(); }
    } catch { setMessage("Không kết nối được máy chủ. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-5 space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
    <h2 className="text-xl font-bold text-slate-900">Gửi chứng nhận để Vexim kiểm tra</h2>
    <p className="text-sm text-slate-600">Chứng nhận PDF/ảnh này <strong>chỉ gửi Vexim nội bộ</strong>. Nộp tệp không có nghĩa được duyệt hoặc hiển thị trên trang buyer. Nếu cần sửa hồ sơ đã nộp, hãy nộp hồ sơ mới hoặc liên hệ Vexim.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Tên tài liệu/chứng nhận *<input name="name" required maxLength={120} className="input mt-1" placeholder="Ví dụ: ISO 22000:2018, HACCP, FDA facility registration" /></label>
      <label className="block text-sm font-semibold">Đơn vị đứng tên trên giấy *<input name="holder_name" required maxLength={160} className="input mt-1" placeholder="Tên nhà máy/công ty được ghi trên giấy" /></label>
      <label className="block text-sm font-semibold">Tổ chức cấp *<input name="issuer" required maxLength={160} className="input mt-1" placeholder="Tên tổ chức cấp/đăng ký" /></label>
      <label className="block text-sm font-semibold">Số chứng nhận/đăng ký<input name="number" maxLength={100} className="input mt-1" /></label>
      <label className="block text-sm font-semibold">Có hiệu lực đến *<input type="date" name="valid_until" required className="input mt-1" /></label>
      <label className="block text-sm font-semibold">PDF hoặc ảnh JPG/PNG/WebP *<input name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" required className="input mt-1" /><span className="mt-1 block text-xs font-normal text-slate-600">Tối đa 15 MB · không đăng công khai bản gốc.</span></label>
    </div>
    <label className="block text-sm font-semibold">Phạm vi trên giấy / cơ sở sản xuất *<textarea name="scope_text" required rows={3} maxLength={400} className="input mt-1" placeholder="Chứng nhận áp dụng cho cơ sở, quy trình và loại hàng nào? Nếu là giấy của nhà máy đối tác, ghi rõ mối liên hệ." /></label>
    <fieldset><legend className="text-sm font-semibold text-slate-900">Sản phẩm đề xuất áp dụng</legend>
      <p className="mt-1 text-xs text-slate-600">Vexim sẽ quyết định lại danh sách thực tế. Không chọn vẫn nộp được nhưng chưa thể công bố trên trang sản phẩm.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{products.map((p) => <label key={p.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" name="product_ids" value={p.id} className="mt-1" />{p.name}</label>)}</div>
    </fieldset>
    <p className="text-xs text-slate-600">FDA registration không phải chứng nhận chất lượng hoặc “FDA approved”. Chứng nhận nhà máy không tự chứng minh mọi sản phẩm/NCC thương mại đều được chứng nhận.</p>
    <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "Đang gửi..." : "Gửi Vexim xét duyệt"}</button>
    {message && <p role="status" className="text-sm font-semibold text-slate-800">{message}</p>}
  </form>;
}
