"use client";

import { QuantityBuyerPreview } from "@/components/products/quantity-pricing-editor";
import { useQuantityPreview, type QuantityPreviewSnapshot } from "@/components/products/quantity-preview-store";

/** Thẻ "Người mua sẽ thấy" đặt ở cột phải của CRM.
 *  Trước khi thuỷ hoá (và khi form chưa đổi gì) thẻ dùng dữ liệu đã lưu; gõ trong form là thẻ đổi theo. */
export function QuantityPreviewCard({ initial, imageUrl }: {
  initial: QuantityPreviewSnapshot | null;
  imageUrl: string | null;
}) {
  const live = useQuantityPreview(initial);
  if (!live) {
    return <section className="card p-4" aria-label="Người mua sẽ thấy">
      <h2 className="text-sm font-bold text-ink-900">Người mua sẽ thấy</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
        Sản phẩm chưa có bảng giá theo số lượng. Nhập ở tab Giá &amp; thương mại để xem trước thẻ người mua.
      </p>
    </section>;
  }
  return <section className="card p-4" aria-label="Người mua sẽ thấy">
    <QuantityBuyerPreview value={live.value} standardGrades={live.standardGrades} policy={live.policy}
      buyerPriceUnit={live.buyerPriceUnit} pricePubliclyVisible={live.pricePubliclyVisible} imageUrl={imageUrl} />
    <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] leading-4 text-ink-500">
      Bản xem trước theo nội dung đang nhập. Người mua chỉ thấy sau khi bảng giá và nội dung được duyệt.
    </p>
  </section>;
}
