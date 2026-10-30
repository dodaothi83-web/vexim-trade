"use client";

import { ProductFormFiveSections } from "@/components/products/product-form-five-sections";
import type { ProductFormDraft } from "@/lib/products/product-form-model";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

/** Display a proposed mapping only. There are deliberately no save or submit actions. */
export function LegacyProductFormPreview({ draft, categories, images = [] }: { draft: ProductFormDraft; categories: CategoryProposalOption[];
  images?: Array<{ id: string; url: string }> }) {
  return <ProductFormFiveSections value={draft} categories={categories} policies={{}} imageCount={images.length}
    imageControls={<div className="space-y-2"><p className="text-sm text-ink-600">Ảnh gốc đủ điều kiện để xem; chưa được sao chép hay công bố từ form này.</p>
      {images.length ? <ul className="flex flex-wrap gap-2">{images.map((image, index) => <li key={image.id}>
        <img src={image.url} alt={`Ảnh gốc ${index + 1}`} className="size-24 rounded-lg border border-ink-200 object-cover" />
      </li>)}</ul> : <p className="text-sm text-ink-500">Không có ảnh gốc phù hợp để hiển thị tại đây.</p>}</div>}
    onChange={() => {}} onSave={() => {}} onSubmit={() => {}} comparisonOnly />;
}
