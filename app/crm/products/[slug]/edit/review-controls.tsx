"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { decideSupplierProductAction } from "./review-actions";

export function SupplierProductReviewControls({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function decide(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setResult(null);
    try {
      const response = await decideSupplierProductAction(new FormData(e.currentTarget));
      setResult(response); if (response.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-4">
    <div className="flex flex-wrap items-end gap-3">
      <form onSubmit={decide}><input type="hidden" name="product_id" value={id} /><input type="hidden" name="decision" value="approved" />
        <button disabled={busy} className="btn btn-primary">Vexim xác nhận nội dung sản phẩm</button></form>
      <form onSubmit={decide} className="flex flex-wrap items-end gap-2"><input type="hidden" name="product_id" value={id} /><input type="hidden" name="decision" value="changes_requested" />
        <label className="text-sm">Nội dung cần sửa <input name="note" required maxLength={1000} className="input mt-1" /></label>
        <button disabled={busy} className="btn btn-soft">Yêu cầu chỉnh sửa</button></form>
    </div>
    {result && <p role="status" className={`mt-3 text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
  </div>;
}
