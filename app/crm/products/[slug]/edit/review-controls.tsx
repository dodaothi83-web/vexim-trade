"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { decideSupplierProductAction } from "./review-actions";

/** Supplier selects the CMS category; staff verifies the actual product, not a second supplier taxonomy. */
export function SupplierProductReviewControls({ id, proposal, reviewed, categories, approved = false }: {
  id: string; proposal?: string | null; reviewed?: string | null;
  categories: CategoryProposalOption[]; approved?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const selected = categories.find((c) => c.slug === (reviewed || proposal));
  async function decide(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setResult(null);
    try {
      const response = await decideSupplierProductAction(new FormData(e.currentTarget));
      setResult(response); if (response.ok) router.refresh();
    } catch { setResult({ ok: false, message: "Không kết nối được máy chủ." }); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-4">
    <p className="text-sm text-ink-700">Danh mục NCC đã chọn: <strong>{selected?.label || proposal || "Chưa chọn danh mục hợp lệ"}</strong>. Vexim kiểm tra sản phẩm thực tế trước khi duyệt; chọn danh mục không tự công khai.</p>
    {!approved && <>
      <form onSubmit={(e) => void decide(e)} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="product_id" value={id} />
        <input type="hidden" name="decision" value="approved" />
        <input type="hidden" name="reviewed_category_slug" value={proposal ?? ""} />
        <button disabled={busy || !selected || selected.slug !== proposal} className="btn btn-primary">Vexim duyệt nội dung sản phẩm</button>
      </form>
      {(!selected || selected.slug !== proposal) && <p className="text-xs text-amber-900">NCC phải chọn lại danh mục đang mở và lưu sản phẩm trước khi Vexim duyệt.</p>}
      <form onSubmit={(e) => void decide(e)} className="flex flex-wrap items-end gap-2"><input type="hidden" name="product_id" value={id} /><input type="hidden" name="decision" value="changes_requested" />
        <label className="text-sm">Nội dung cần sửa <input name="note" required maxLength={1000} className="input mt-1" /></label>
        <button disabled={busy} className="btn btn-soft">Yêu cầu chỉnh sửa</button></form>
    </>}
    {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
  </div>;
}
