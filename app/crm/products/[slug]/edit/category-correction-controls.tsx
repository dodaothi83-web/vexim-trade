"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { correctSupplierProductCategoryAction } from "./review-actions";

/**
 * Cho phép staff đổi danh mục sản phẩm đã được duyệt mà không làm thay đổi
 * trạng thái xuất bản. Hàm `correctSupplierProductCategoryAction` chỉ chấp nhận
 * sản phẩm đang ở trạng thái "approved".
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
    <section className="rounded-xl border border-ink-200 bg-white p-4">
      <h2 className="text-sm font-bold text-ink-900">Điều chỉnh danh mục</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-600">
        Đổi danh mục cho sản phẩm đã duyệt mà không thay đổi trạng thái xuất bản.
        Việc thay đổi danh mục có thể ảnh hưởng tới chứng nhận được thừa hưởng
        và nhóm hàng hiển thị.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="product_id" value={id} />
        <label className="min-w-0 flex-1 text-sm font-semibold">
          Danh mục mới
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
          className="btn btn-soft"
        >
          {busy ? "Đang lưu..." : "Lưu danh mục"}
        </button>
      </form>
      {result && (
        <p
          role="status"
          className={`mt-2 text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}
        >
          {result.message}
        </p>
      )}
      {currentSlug && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
          Danh mục hiện tại:{" "}
          <span className="font-semibold text-ink-700">
            {categories.find((c) => c.slug === currentSlug)?.label ?? currentSlug}
          </span>
        </p>
      )}
    </section>
  );
}
