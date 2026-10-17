"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { INITIAL_DOCUMENT_KEYS } from "@/lib/supplier-portal/policy";

const LABELS: Record<typeof INITIAL_DOCUMENT_KEYS[number], string> = {
  business_license: "Đăng ký doanh nghiệp",
  food_safety: "Giấy ATTP (nếu có)",
  haccp_or_brc: "HACCP / BRC / ISO (nếu có)",
  product_certs: "Chứng chỉ sản phẩm (nếu có)",
  export_license: "Giấy phép xuất khẩu (nếu áp dụng)",
};

export function SupplierPortalUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const element = event.currentTarget;
      const form = new FormData(element);
      const response = await fetch("/api/supplier-portal/evidence", { method: "POST", body: form });
      const result = await response.json() as { ok?: boolean; message?: string };
      setMessage(result.message ?? (response.ok ? "Đã lưu." : "Không lưu được tệp."));
      if (response.ok) { element.reset(); router.refresh(); }
    } catch { setMessage("Không kết nối được máy chủ. Vui lòng thử lại."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={upload} className="mt-5 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-4">
    <label className="block flex-1 text-sm"><span className="mb-1 block font-semibold">Mục tài liệu</span>
      <select name="checklistKey" className="input" required>{INITIAL_DOCUMENT_KEYS.map((key) => <option key={key} value={key}>{LABELS[key]}</option>)}</select>
    </label>
    <label className="block flex-1 text-sm"><span className="mb-1 block font-semibold">Tệp PDF hoặc ảnh (tối đa 15 MB)</span>
      <input name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp" className="input" required />
    </label>
    <button disabled={busy} className="btn btn-primary" type="submit">{busy ? "Đang tải..." : "Bổ sung giấy tờ"}</button>
    {message && <p role="status" className="w-full text-sm text-ink-700">{message}</p>}
  </form>;
}
