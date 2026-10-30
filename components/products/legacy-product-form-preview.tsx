"use client";

import { ProductFormFiveSections } from "@/components/products/product-form-five-sections";
import type { ProductFormDraft } from "@/lib/products/product-form-model";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

/** Display a proposed mapping only. There are deliberately no save or submit actions. */
export function LegacyProductFormPreview({ draft, categories }: { draft: ProductFormDraft; categories: CategoryProposalOption[] }) {
  return <ProductFormFiveSections value={draft} categories={categories} policies={{}} imageCount={0}
    imageControls={<p className="text-sm text-ink-600">Ảnh gốc chưa được sao chép vào form; xem hồ sơ gốc để đối chiếu.</p>}
    onChange={() => {}} onSave={() => {}} onSubmit={() => {}} comparisonOnly />;
}
