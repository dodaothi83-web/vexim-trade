"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { decideSupplierProductAction } from "./review-actions";

/** Staff chọn danh mục cuối cùng và đăng sản phẩm trong một thao tác. */
export function SupplierProductReviewControls({
  id, proposal, reviewed, categories, scope = [], inferredCategory = null, allowChanges = false,
}: {
  id: string;
  proposal?: string | null;
  reviewed?: string | null;
  categories: CategoryProposalOption[];
  /** Nhóm hàng NCC đăng ký chỉ dùng để cảnh báo, không chặn đăng. */
  scope?: string[];
  /** Gợi ý từ nội dung chỉ dùng để cảnh báo. */
  inferredCategory?: string | null;
  allowChanges?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [selectedSlug, setSelectedSlug] = useState((reviewed || proposal) ?? "");
  const selected = categories.find((c) => c.slug === selectedSlug);
  const inferred = categories.find((c) => c.slug === inferredCategory);
  const outsideScope = !!selected && scope.length > 0 && !scope.includes(selected.slug);

  async function decide(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const response = await decideSupplierProductAction(new FormData(e.currentTarget));
      setResult(response);
      if (response.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "Không kết nối được máy chủ." });
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 space-y-4">
    <form onSubmit={(e) => void decide(e)} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="product_id" value={id} />
      <input type="hidden" name="decision" value="approved" />
      <label className="min-w-0 flex-1 text-sm font-semibold">Danh mục đăng
        <select name="reviewed_category_slug" required className="input mt-1" value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}>
          <option value="" disabled>Chọn danh mục</option>
          {categories.map((category) => <option key={category.slug} value={category.slug}>{category.group ? `${category.group} / ${category.label}` : category.label}</option>)}
        </select>
      </label>
      <button disabled={busy || !selected} className="btn btn-primary">{busy ? "Đang đăng..." : "Duyệt và đăng"}</button>
    </form>
    {!selected && <p className="text-xs text-amber-900">Chọn danh mục đang xuất bản trước khi duyệt.</p>}
    {outsideScope && <p className="text-xs text-amber-900">Danh mục nằm ngoài nhóm hàng NCC đã đăng ký. Kiểm tra trước khi đăng.</p>}
    {selected && inferred && inferred.slug !== selected.slug && <p className="text-xs text-amber-900">Nội dung có thể thuộc nhóm {inferred.label}. Kiểm tra danh mục trước khi đăng.</p>}
    {allowChanges && <form onSubmit={(e) => void decide(e)} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="product_id" value={id} />
      <input type="hidden" name="decision" value="changes_requested" />
      <label className="text-sm">Nội dung cần sửa <input name="note" required maxLength={1000} className="input mt-1" /></label>
      <button disabled={busy} className="btn btn-soft">Yêu cầu chỉnh sửa</button>
    </form>}
    {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
  </div>;
}
