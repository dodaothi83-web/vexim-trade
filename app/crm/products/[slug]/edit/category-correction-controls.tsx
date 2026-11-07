"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { correctSupplierProductCategoryAction } from "./review-actions";

export function CategoryCorrectionControls({
  id,
  currentSlug,
  categories,
}: {
  id: string;
  currentSlug: string | null;
  categories: CategoryProposalOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState(currentSlug ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const hasChanges = selectedSlug && selectedSlug !== currentSlug;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !hasChanges) return;
    setBusy(true);
    setResult(null);
    try {
      const data = new FormData(e.currentTarget);
      const response = await correctSupplierProductCategoryAction(data);
      setResult(response);
      if (response.ok) {
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "Không kết nối được máy chủ." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 px-4 py-3">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="product_id" value={id} />
        <label className="min-w-0 flex-1 text-sm">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand-700">Danh mục</span>
          <select
            name="reviewed_category_slug"
            required
            disabled={busy}
            className="input mt-1"
            value={selectedSlug}
            onChange={(e) => {
              setSelectedSlug(e.target.value);
              setResult(null);
            }}
          >
            <option value="" disabled>Chọn danh mục</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.group ? `${category.group} / ${category.label}` : category.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !hasChanges}
          className="btn btn-sm btn-soft"
        >
          {busy ? "Đang lưu..." : "Lưu"}
        </button>
      </form>
      {result && (
        <p
          role="status"
          className={`mt-2 text-xs ${result.ok ? "text-emerald-700" : "text-rose-700"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
