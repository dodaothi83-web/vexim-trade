"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Category } from "@/lib/types";
import { useToast } from "@/components/toast";
import { decideCategoryPublicationAction } from "./publication-actions";

/** Reviewers can inspect copy before acting, but cannot edit the category itself. */
export function CategoryPublicationQueue({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function decide(category: Category, publish: boolean) {
    if (!window.confirm(publish
      ? `Đã đọc nội dung và xác nhận công khai danh mục “${category.name_i18n?.en ?? category.slug}”?`
      : `Ẩn danh mục “${category.name_i18n?.en ?? category.slug}” khỏi website?`)) return;
    setBusy(category.id);
    try {
      const result = await decideCategoryPublicationAction(category.id, publish);
      toast.push({ kind: result.ok ? "success" : "error", title: result.message });
      if (result.ok) router.refresh();
    } catch {
      toast.push({ kind: "error", title: "Không kết nối được máy chủ. Vui lòng thử lại." });
    } finally {
      setBusy(null);
    }
  }
  return <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
    <header><h1 className="text-2xl font-black text-ink-900">Kiểm duyệt danh mục sản phẩm</h1>
      <p className="mt-1 text-sm text-ink-600">Đọc nội dung trước khi xác nhận. Quyết định công khai không chỉnh sửa nội dung hoặc tự duyệt sản phẩm.</p></header>
    {categories.map((category) => {
      const published = category.status === "published" && category.is_published;
      return <section key={category.id} className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-ink-900">{category.name_i18n?.en ?? category.slug}</h2>
          <span className="text-xs font-semibold text-ink-500">{published ? "Đã công khai" : "Bản nháp"}</span></div>
        <p className="text-sm text-ink-600">/{category.slug} · {category.intro_i18n?.en || "Chưa có mô tả"}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {category.hero_image && <img src={category.hero_image} alt={category.hero_alt_i18n?.en || "Ảnh bìa danh mục"} className="h-40 w-full rounded-xl object-cover" />}
        <details className="rounded-xl border border-ink-200 p-3 text-sm text-ink-700" open={!published}>
          <summary className="cursor-pointer font-semibold">Nội dung, SEO & dữ kiện cần đối chiếu</summary>
          <div className="mt-3 space-y-2">
            <p><strong>Tiêu đề:</strong> {category.h1_i18n?.en || category.name_i18n?.en}</p>
            <p><strong>Mô tả chi tiết:</strong> {category.body_i18n?.en?.replace(/<[^>]+>/g, " ") || "Chưa có"}</p>
            <p><strong>SEO:</strong> {category.seo_title_i18n?.en || "Chưa có"} · {category.seo_desc_i18n?.en || "Chưa có"}</p>
            <p><strong>Thông số:</strong> {category.spec_columns?.length ?? 0} cột; {category.spec_rows?.length ?? 0} dòng · <strong>FAQ:</strong> {category.faq_i18n?.length ?? 0} mục</p>
            <p className="text-xs text-ink-500">Người sửa nội dung cuối: {category.updated_by || "Hồ sơ cũ chưa có người sửa"}</p>
          </div>
        </details>
        <div className="flex flex-wrap gap-3 text-sm">
          {published && <a href={`/products/${category.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost">Xem trang công khai</a>}
          <button type="button" className={published ? "btn btn-soft" : "btn btn-primary"} disabled={busy !== null}
            onClick={() => void decide(category, !published)}>{published ? "Ẩn danh mục" : "Xác nhận công khai"}</button>
        </div>
      </section>;
    })}
    {!categories.length && <p className="card p-5 text-sm text-ink-500">Chưa có danh mục nào để kiểm duyệt.</p>}
  </div>;
}
