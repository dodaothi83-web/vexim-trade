"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { correctSupplierProductCategoryAction } from "./review-actions";
import { CategoryPicker } from "@/components/category-picker";
import { toPickerOption } from "./review-controls";

/**
 * Cho phép staff đổi danh mục sản phẩm đã được duyệt mà không làm thay đổi
 * trạng thái xuất bản. Hàm `correctSupplierProductCategoryAction` chỉ chấp nhận
 * sản phẩm đang ở trạng thái "approved". Đặt ở đầu trang (trên form chính) để
 * nhân viên thấy ngay sản phẩm nào mà không phải kéo hết trang xuống.
 */
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
  const [result, setResult] = useState<{ ok: boolean; message: string; warning?: string } | null>(null);

  const hasChanges = selectedSlug && selectedSlug !== currentSlug &&
    categories.some((c) => c.slug === selectedSlug && c.leaf !== false);

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
        <div className="min-w-0 flex-1 basis-72 text-sm">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-brand-700">Danh mục</span>
          <div className="mt-1">
            <CategoryPicker
              name="reviewed_category_slug"
              options={categories.map(toPickerOption)}
              value={selectedSlug}
              disabled={busy}
              onChange={(slug) => {
                setSelectedSlug(slug);
                setResult(null);
              }}
            />
          </div>
        </div>
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
      {result?.warning && (
        <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {result.warning}
        </p>
      )}
    </div>
  );
}
