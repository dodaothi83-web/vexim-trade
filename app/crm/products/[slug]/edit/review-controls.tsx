"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";
import { CategoryPicker, type CategoryPickerOption } from "@/components/category-picker";
import type { ProductPublicationMediaState } from "@/lib/media/readiness";
import { decideSupplierProductAction } from "./review-actions";
import { useProductEditWorkspace } from "./edit-workspace";

export const toPickerOption = (c: CategoryProposalOption): CategoryPickerOption => ({
  id: c.id, slug: c.slug, label: c.label, label_en: c.label_en, parent_slug: c.parent_slug ?? null, leaf: c.leaf,
});

/** Staff chọn danh mục cuối cùng và đăng sản phẩm trong một thao tác. */
export function SupplierProductReviewControls({
  id, proposal, reviewed, categories, scope = [], inferredCategory = null, mediaReview, allowChanges = false,
}: {
  id: string;
  proposal?: string | null;
  reviewed?: string | null;
  categories: CategoryProposalOption[];
  /** Nhóm hàng NCC đăng ký chỉ dùng để cảnh báo, không chặn đăng. */
  scope?: string[];
  /** Gợi ý từ nội dung chỉ dùng để cảnh báo. */
  inferredCategory?: string | null;
  mediaReview: ProductPublicationMediaState;
  allowChanges?: boolean;
}) {
  const router = useRouter();
  const { dirty } = useProductEditWorkspace();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [selectedSlug, setSelectedSlug] = useState((reviewed || proposal) ?? "");
  // Chỉ danh mục lá mới đăng được (nhóm lớn đã chia nhóm nhỏ thì chọn nhóm nhỏ).
  const selected = categories.find((c) => c.slug === selectedSlug && c.leaf !== false);
  const inferred = categories.find((c) => c.slug === inferredCategory);
  const outsideScope = !!selected && scope.length > 0 && !scope.includes(selected.slug);
  const mediaBlocker = mediaReview.buyerImages === 0
    ? "Cần ít nhất một ảnh chia sẻ cho người mua."
    : null;

  async function decide(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    if (dirty && data.get("decision") === "approved") {
      setResult({ ok: false, message: "Lưu thay đổi trong hồ sơ và bản dịch trước khi duyệt và đăng." });
      return;
    }
    if (data.get("decision") === "approved" && !mediaReview.ready) {
      setResult({ ok: false, message: mediaBlocker ?? "Thêm ảnh chia sẻ cho người mua trước khi đăng." });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const response = await decideSupplierProductAction(data);
      setResult(response);
      if (response.ok && data.get("decision") === "approved") {
        // Ở lại trang để kiểm tra kết quả; trang hiện khung "Đã đăng" với sản phẩm tiếp theo và đường về danh sách.
        const params = new URLSearchParams(window.location.search);
        params.set("published", "1");
        router.replace(`${window.location.pathname}?${params.toString()}`);
      } else if (response.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "Không kết nối được máy chủ." });
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 space-y-4">
    {!mediaReview.ready && <div className="rounded-xl border border-amber-300 bg-white/70 px-3.5 py-3 text-[12.5px] leading-5 text-amber-950">
      <p className="font-bold">Cần thêm ảnh trước khi đăng</p>
      <p className="mt-0.5">{mediaBlocker}</p>
      <a href="#product-media" className="mt-1.5 inline-block font-semibold text-brand-800 underline underline-offset-2">Mở mục Ảnh &amp; tài liệu sản phẩm</a>
    </div>}
    <form onSubmit={(e) => void decide(e)} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="product_id" value={id} />
      <input type="hidden" name="decision" value="approved" />
      <div className="min-w-0 flex-1 basis-72 text-sm font-semibold">Danh mục đăng
        <div className="mt-1 font-normal">
          <CategoryPicker name="reviewed_category_slug" options={categories.map(toPickerOption)} value={selectedSlug}
            onChange={setSelectedSlug} disabled={busy} scope={scope} invalid={!selected} />
        </div>
      </div>
      <button disabled={busy || !selected || dirty || !mediaReview.ready} className="btn btn-primary">{busy ? "Đang đăng..." : "Duyệt và đăng"}</button>
    </form>
    {dirty && <p role="alert" className="text-xs font-semibold text-amber-900">Lưu thay đổi trong hồ sơ và bản dịch trước khi duyệt và đăng.</p>}
    {!selected && <p className="text-xs text-amber-900">Chọn danh mục đang xuất bản trước khi duyệt.</p>}
    {outsideScope && <p className="text-xs text-amber-900">Danh mục nằm ngoài nhóm hàng nhà cung cấp đã đăng ký. Kiểm tra trước khi đăng.</p>}
    {selected && inferred && inferred.slug !== selected.slug && <p className="text-xs text-amber-900">Nội dung có thể thuộc nhóm {inferred.label}. Kiểm tra danh mục trước khi đăng.</p>}
    {allowChanges && <form onSubmit={(e) => void decide(e)} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="product_id" value={id} />
      <input type="hidden" name="decision" value="changes_requested" />
      <label className="text-sm">Nội dung cần sửa <input name="note" required maxLength={1000} disabled={busy} className="input mt-1" /></label>
      <button disabled={busy} className="btn btn-soft">Yêu cầu chỉnh sửa</button>
    </form>}
    {result && <p role="status" className={`text-sm ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>{result.message}</p>}
  </div>;
}
