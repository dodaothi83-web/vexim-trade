"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PublicProductCard } from "@/components/public-product-card";
import { HOME_FEED_PER_PAGE } from "@/lib/public/supplier-product-order";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";

export type HomeFeedProduct = PublicCategoryProduct & { categorySlug: string };

/**
 * Lưới sản phẩm trang chủ, chia trang ngay trên trình duyệt.
 *
 * Vì sao không để trang chủ dài ra: đây là mặt tiền mời nhà cung cấp, không phải
 * trang danh sách. Sáu thẻ đủ để thấy sàn có hàng thật, phần còn lại nằm ở trang
 * sau với một ô chuyển trang nhỏ.
 *
 * Vì sao không đổi URL theo trang: mỗi số trang thành một địa chỉ riêng là thêm
 * một bản gần giống của cùng một trang cho máy tìm kiếm phải xử lý, trong khi
 * không có nội dung mới nào. Trang chủ giữ nguyên một địa chỉ, thứ tự sản phẩm
 * vẫn là thứ tự xác minh đã tính ở phía máy chủ.
 */
export function HomeProductFeed({
  items,
  perPage = HOME_FEED_PER_PAGE,
  isVi = false,
}: {
  items: HomeFeedProduct[];
  perPage?: number;
  isVi?: boolean;
}) {
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLUListElement>(null);
  const mounted = useRef(false);
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  // Dữ liệu đổi trong lúc đang xem thì kẹp lại, không để rơi vào trang rỗng.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * perPage;
  const shown = items.slice(start, start + perPage);

  // Sang trang thì kéo lưới vào tầm mắt, nhưng chỉ khi nó đã ra khỏi màn hình,
  // để người đang xem trên màn rộng không bị nhảy trang đột ngột.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    listRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  return (
    <>
      <ul
        ref={listRef}
        className="mt-6 grid grid-cols-2 items-stretch gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
      >
        {shown.map((p) => (
          <li key={p.id} className="min-w-0">
            <PublicProductCard
              href={`/products/${encodeURIComponent(p.categorySlug)}/${encodeURIComponent(p.id)}`}
              imagePath={p.cardImagePath ?? p.imagePaths[0]}
              name={p.name}
              moq={p.moq}
              price={p.price}
              fob={p.incoterm?.toUpperCase() === "FOB"}
              leadTimeDays={p.leadTimeDays}
              supplierName={p.supplierName}
              supplierHref={`/suppliers/${encodeURIComponent(p.supplierSlug || p.supplierId)}`}
              verificationSteps={p.verificationSteps}
            />
          </li>
        ))}
      </ul>

      {pageCount > 1 && (
        <nav
          aria-label={isVi ? "Chuyển trang sản phẩm" : "Product pages"}
          className="mt-7 flex items-center justify-center gap-3"
        >
          <button
            type="button"
            onClick={() => setPage(Math.max(1, current - 1))}
            disabled={current === 1}
            aria-label={isVi ? "Trang trước" : "Previous page"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-brand-500 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:text-ink-700"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p aria-live="polite" className="min-w-14 text-center text-sm font-semibold tabular-nums text-ink-700">
            {current}/{pageCount}
          </p>
          <button
            type="button"
            onClick={() => setPage(Math.min(pageCount, current + 1))}
            disabled={current === pageCount}
            aria-label={isVi ? "Trang sau" : "Next page"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-brand-500 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:text-ink-700"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </nav>
      )}
    </>
  );
}
