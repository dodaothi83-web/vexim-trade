"use client";

import { ProductFormFiveSections } from "@/components/products/product-form-five-sections";
import type { ProductFormDraft } from "@/lib/products/product-form-model";
import type { QuantityPricingPolicy } from "@/lib/products/quantity-pricing";
import type { CategoryProposalOption } from "@/lib/supplier-portal/category-proposals";

type ReviewImage = { id: string; url: string | null };

/** The submitted snapshot is read-only. Approval remains a separate staff action. */
export function ProductFormSubmittedReview({ draft, categories, policies, images, imagesValid }: {
  draft: ProductFormDraft; categories: CategoryProposalOption[]; policies: Record<string, QuantityPricingPolicy>;
  images: ReviewImage[]; imagesValid: boolean;
}) {
  const hasUnverifiedLegacy = images.some((image) => !image.url);
  return <ProductFormFiveSections value={draft} categories={categories} policies={policies} imageCount={images.length}
    coverUrl={imagesValid ? images[0]?.url : null} reviewOnly
    imageControls={<div className="space-y-2">
      <p className="text-sm text-ink-600">Kiểm tra từng ảnh trong bản gửi. Duyệt sản phẩm cũng duyệt ảnh để công bố; ảnh đầu tiên là ảnh chính.</p>
      {!imagesValid ? <p role="alert" className="text-sm text-rose-700">Không xác nhận được danh sách ảnh. Hãy tải lại trang.</p> :
        <div className="flex flex-wrap gap-3">{images.map((image, index) => image.url
          ? <figure key={image.id}><a href={image.url} target="_blank" rel="noopener noreferrer" aria-label={`Mở ảnh ${index + 1} trong bản gửi`}>
            <img src={image.url} alt={index === 0 ? "Ảnh chính trong bản gửi" : `Ảnh ${index + 1} trong bản gửi`} className="size-24 rounded-lg border border-ink-200 object-cover" />
          </a><figcaption className="mt-1 text-xs text-ink-600">{index === 0 ? "Ảnh chính" : `Ảnh ${index + 1}`}</figcaption></figure>
          : <p key={image.id} className="max-w-48 text-sm text-amber-800">Ảnh cũ cần được sao chụp riêng tư trước khi duyệt.</p>)}</div>}
      {hasUnverifiedLegacy && <p className="text-xs text-amber-800">Không thể duyệt khi ảnh cũ chưa được kiểm tra an toàn.</p>}
    </div>}
    onChange={() => {}} onSave={() => {}} onSubmit={() => {}} />;
}
