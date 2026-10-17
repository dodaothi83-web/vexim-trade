"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MediaAsset, SupplierProduct } from "@/lib/types";
import { saveSupplierProductAction, submitSupplierProductAction } from "../product-actions";

const FIELDS = [
  ["name", "Tên sản phẩm *", 180], ["description", "Mô tả ngắn / công dụng", 1500],
  ["spec", "Quy cách / tiêu chuẩn", 800], ["unit", "Đơn vị tính", 40],
  ["moq", "MOQ", 180], ["monthly_capacity", "Công suất / tháng", 180],
  ["packaging", "Bao bì / đóng gói", 300], ["certifications", "Chứng nhận sản phẩm (tự khai)", 300],
  ["export_port", "Cảng xuất", 120], ["incoterm", "Incoterm", 20],
  ["incoterm_place", "Địa điểm Incoterm", 100], ["payment_terms", "Thanh toán", 200],
  ["lead_time_days", "Lead time (ngày)", 5], ["ref_price", "Giá tham khảo (không phải báo giá RFQ)", 20],
  ["currency", "Đơn vị tiền (USD/EUR/...)", 10], ["price_valid_until", "Hạn giá (YYYY-MM-DD)", 10],
] as const;

export function SupplierProductEditor({ product, media = [], userId }: { product?: SupplierProduct; media?: MediaAsset[]; userId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [uploadResult, setUploadResult] = useState("");
  const locked = product?.supplier_review_status === "pending";
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setResult(null);
    try {
      const form = new FormData(event.currentTarget);
      if (product) form.set("product_id", product.id);
      const res = await saveSupplierProductAction(form);
      setResult(res);
      if (res.ok && res.id && !product) router.push(`/supplier/portal/products/${res.id}`);
      else if (res.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!product) return;
    setBusy(true); setResult(null);
    try {
      const form = new FormData(); form.set("product_id", product.id);
      const res = await submitSupplierProductAction(form);
      setResult(res); if (res.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!product) return;
    const element = event.currentTarget;
    setBusy(true); setUploadResult("");
    try {
      const response = await fetch(`/api/supplier-portal/products/${product.id}/media`, { method: "POST", body: new FormData(element) });
      const data = await response.json() as { ok: boolean; message: string };
      setUploadResult(data.message);
      if (data.ok) { element.reset(); router.refresh(); }
    } catch { setUploadResult("Không kết nối được máy chủ."); }
    finally { setBusy(false); }
  }
  async function removeMedia(mediaId: string) {
    if (!product || !window.confirm("Xóa tệp nháp này?")) return;
    setBusy(true); setUploadResult("");
    try {
      const response = await fetch(`/api/supplier-portal/products/${product.id}/media?media_id=${encodeURIComponent(mediaId)}`, { method: "DELETE" });
      const data = await response.json() as { ok: boolean; message: string };
      setUploadResult(data.message); if (data.ok) router.refresh();
    } catch { setUploadResult("Không kết nối được máy chủ."); }
    finally { setBusy(false); }
  }
  return <div className="mt-6 space-y-5">
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <strong>Trạng thái: {product?.supplier_review_status === "approved" ? "Đã được Vexim xác nhận nội dung" : locked ? "Đang chờ Vexim kiểm tra" : product?.supplier_review_status === "changes_requested" ? "Cần bổ sung" : "Bản nháp"}.</strong>
      {product?.supplier_review_note && <p className="mt-2 whitespace-pre-wrap">Vexim yêu cầu: {product.supplier_review_note}</p>}
      <p className="mt-1">Sửa sản phẩm đã duyệt sẽ đưa sản phẩm về bản nháp và tạm ẩn khỏi buyer. Tải ảnh/catalogue chỉ để Vexim xem; chỉ Vexim chọn tệp chia sẻ buyer, kiểm tra nội dung và bật công khai.</p>
    </div>
    <form onSubmit={save} className="rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-lg font-bold">Thông tin sản phẩm</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{FIELDS.map(([key, label, max]) => <label key={key} className="block text-sm">
        <span className="mb-1 block font-semibold">{label}</span>
        <input className="input" name={key} required={key === "name"} maxLength={max} defaultValue={String(product?.[key] ?? "")} disabled={locked} />
      </label>)}</div>
      <div className="mt-4 flex gap-5 text-sm"><label><input type="checkbox" name="oem" value="yes" defaultChecked={product?.oem ?? false} disabled={locked} /> Nhận OEM</label>
        <label><input type="checkbox" name="samples" value="yes" defaultChecked={product?.samples ?? false} disabled={locked} /> Có mẫu</label></div>
      {!locked && <button type="submit" disabled={busy} className="btn btn-primary mt-5">{busy ? "Đang lưu..." : "Lưu bản nháp"}</button>}
      {result && <p role="status" className={`mt-3 text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
    </form>
    {product && <section className="rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="text-lg font-bold">Ảnh & catalogue sản phẩm</h2>
      <p className="mt-1 text-sm text-ink-600">Tối đa 12 tệp do bạn tải, ảnh JPG/PNG/WebP tối đa 8 MB hoặc catalogue PDF tối đa 15 MB. Tệp chỉ ở chế độ nội bộ cho đến khi Vexim duyệt chia sẻ.</p>
      {media.length > 0 && <ul className="mt-3 space-y-2 text-sm">{media.map((m) => <li key={m.id} className="rounded-lg bg-ink-50 p-3">
        {m.storage_path && <a href={`/api/media/file/${m.storage_path}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">{m.caption || m.kind}</a>}
        <span className="ml-2 text-xs text-ink-500">{m.audience === "buyer" ? "Vexim đã chia sẻ buyer" : "Nội bộ · chờ Vexim"}</span>
        {!locked && product.supplier_review_status !== "approved" && m.audience === "internal" && m.created_by === userId &&
          <button type="button" disabled={busy} onClick={() => void removeMedia(m.id)} className="ml-3 text-xs font-semibold text-rose-700 underline">Xóa tệp nháp</button>}
      </li>)}</ul>}
      {!locked && product.supplier_review_status !== "approved" && <form onSubmit={upload} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">Loại tệp <select name="kind" className="input mt-1"><option value="image">Ảnh sản phẩm</option><option value="catalogue">Catalogue PDF</option></select></label>
        <label className="min-w-[200px] flex-1 text-sm">Chọn tệp <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required className="input mt-1" /></label>
        <button type="submit" disabled={busy} className="btn btn-soft">Tải tệp</button>
      </form>}
      {product.supplier_review_status === "approved" && <p className="mt-3 text-sm text-ink-600">Để bổ sung ảnh hoặc sửa nội dung, lưu thay đổi ở trên trước; sản phẩm sẽ quay về bản nháp chờ Vexim kiểm tra lại.</p>}
      {uploadResult && <p role="status" className="mt-2 text-sm text-ink-700">{uploadResult}</p>}
      {product.supplier_review_status !== "pending" && product.supplier_review_status !== "approved" && <button type="button" disabled={busy} onClick={submit} className="btn btn-primary mt-5">Gửi sản phẩm cho Vexim kiểm tra</button>}
    </section>}
  </div>;
}
