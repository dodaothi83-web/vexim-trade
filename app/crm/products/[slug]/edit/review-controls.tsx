"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { correctSupplierProductCategoryAction, decideSupplierProductAction } from "./review-actions";

export function SupplierProductReviewControls({ id, proposal, reviewed, categories, approved = false }: {
  id: string; proposal?: string | null; reviewed?: string | null;
  categories: CategoryProposalOption[]; approved?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  async function decide(e: React.FormEvent<HTMLFormElement>, correction = false) {
    e.preventDefault(); setBusy(true); setResult(null);
    try {
      const response = correction ? await correctSupplierProductCategoryAction(new FormData(e.currentTarget)) :
        await decideSupplierProductAction(new FormData(e.currentTarget));
      setResult(response); if (response.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-4">
    <p className="text-sm text-ink-700">NCC đề xuất: <strong>{categories.find((c) => c.slug === proposal)?.label || proposal || "Chưa chọn · Vexim phân loại"}</strong>. Đây chưa phải danh mục được Vexim duyệt.</p>
    <form onSubmit={(e) => void decide(e, approved)} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="product_id" value={id} />
      {!approved && <input type="hidden" name="decision" value="approved" />}
      <label className="min-w-[220px] flex-1 text-sm font-semibold">Danh mục Vexim xác nhận *
        <select name="reviewed_category_slug" className="input mt-1" required defaultValue={reviewed || proposal || ""} disabled={busy}>
          <option value="">Chọn danh mục chính xác</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.group ? `${c.group} · ` : ""}{c.label}</option>)}
        </select>
      </label>
      <button disabled={busy || !categories.length} className="btn btn-primary">{approved ? "Lưu danh mục đã xác nhận" : "Vexim duyệt nội dung & danh mục"}</button>
    </form>
    {approved ? <p className="text-xs text-ink-600">Thay đổi danh mục sẽ tạm tắt sẵn sàng gửi buyer, không tự công khai lại.</p>
      : <form onSubmit={(e) => void decide(e)} className="flex flex-wrap items-end gap-2"><input type="hidden" name="product_id" value={id} /><input type="hidden" name="decision" value="changes_requested" />
        <label className="text-sm">Nội dung cần sửa <input name="note" required maxLength={1000} className="input mt-1" /></label>
        <button disabled={busy} className="btn btn-soft">Yêu cầu chỉnh sửa</button></form>}
    {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
  </div>;
}
