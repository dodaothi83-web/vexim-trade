"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cardTitleGrades, PublicProductCard } from "@/components/public-product-card";
import { HOME_FEED_PER_PAGE, HOME_FEED_WIDE_QUERY, feedPerPage } from "@/lib/public/supplier-product-order";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";
import { hasProductComparisonPeer } from "@/lib/public/product-comparison";

export type HomeFeedProduct = PublicCategoryProduct & { categorySlug: string };

export function pageSlice<T>(items: T[], page: number, perPage: number = HOME_FEED_PER_PAGE) {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  return { shown: items.slice((current - 1) * perPage, current * perPage), current, pageCount };
}

/**
 * Bề rộng màn hình có đủ năm cột hay không, đọc qua matchMedia.
 *
 * Lần dựng đầu tiên ở trình duyệt dùng đúng getServerSnapshot (6 thẻ), rồi mới
 * đổi sang 15 thẻ và năm cột trên desktop. Bản máy chủ và bản thuỷ hợp khớp nhau.
 */
function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(HOME_FEED_WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const readWide = () => window.matchMedia(HOME_FEED_WIDE_QUERY).matches;
const serverWide = () => false;

/**
 * Lưới sản phẩm trang chủ, chia trang ngay trên trình duyệt.
 *
 * Vì sao không để trang chủ dài ra: đây là mặt tiền mời nhà cung cấp, không phải
 * trang danh sách. Mỗi trang giữ hai đến ba hàng thẻ, phần còn lại nằm ở trang sau
 * với một ô chuyển trang nhỏ.
 *
 * Vì sao không đổi URL theo trang: mỗi số trang thành một địa chỉ riêng là thêm
 * một bản gần giống của cùng một trang cho máy tìm kiếm phải xử lý, trong khi
 * không có nội dung mới nào. Trang chủ giữ nguyên một địa chỉ, thứ tự sản phẩm
 * vẫn là thứ tự xác minh đã tính ở phía máy chủ, và lần tải nào cũng bắt đầu ở
 * trang một với đúng thứ tự đó.
 */
export function HomeProductFeed({
  items,
  perPage,
  isVi = false,
}: {
  items: HomeFeedProduct[];
  /** Ép số thẻ mỗi trang; bỏ trống thì tính theo bề rộng màn hình. */
  perPage?: number;
  isVi?: boolean;
}) {
  const wide = useSyncExternalStore(subscribeWide, readWide, serverWide);
  const size = perPage ?? feedPerPage(wide);
  const [page, setPage] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const scrollWanted = useRef(false);
  // Dữ liệu đổi trong lúc đang xem thì kẹp lại, không để rơi vào trang rỗng.
  // Đổi cỡ màn hình thì số thẻ mỗi trang đổi theo; pageSlice tự kẹp số trang,
  // nên không rơi vào trang rỗng khi số trang ít đi.
  const { shown, current, pageCount } = pageSlice(items, page, size);

  // Respect reduced-motion preferences when scrolling after manual navigation.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Sang trang do người xem bấm thì kéo lưới vào tầm mắt nếu đã ra khỏi màn hình.
  useEffect(() => {
    if (!scrollWanted.current) return;
    scrollWanted.current = false;
    listRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [current, reducedMotion]);

  const goTo = (next: number) => {
    scrollWanted.current = true;
    setPage(Math.min(Math.max(1, next), pageCount));
  };

  return (
    <>
      <ul
        ref={listRef}
        // Năm cột và 15 thẻ chỉ bật cùng lúc sau khi trình duyệt xác nhận desktop.
        className={`mt-6 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3${
          wide ? " lg:grid-cols-5" : ""
        }`}
      >
        {shown.map((p) => (
          <li key={p.id} className="min-w-0">
            <PublicProductCard
              href={`/products/${encodeURIComponent(p.categorySlug)}/${encodeURIComponent(p.id)}`}
              imagePath={p.cardImagePath ?? p.imagePaths[0]}
              name={p.name}
              grades={cardTitleGrades(p)}
              gradeRows={p.gradeRows}
              stalePriceDays={p.quantityOffer?.stale ? p.quantityOffer.daysSinceConfirmed : undefined}
              volumePricing={p.quantityOffer?.hasVolumePricing}
              moq={p.moq}
              price={p.price}
              incoterm={p.incoterm}
              fob={p.incoterm?.toUpperCase() === "FOB"}
              leadTimeDays={p.leadTimeDays}
              leadTimeText={p.leadTimeText}
              supplierName={p.supplierName}
              supplierHref={`/suppliers/${encodeURIComponent(p.supplierSlug || p.supplierId)}`}
              quoteHref={p.isDemo ? undefined : `/rfq?category=${encodeURIComponent(p.categorySlug)}&suppliers=${encodeURIComponent(p.supplierId)}&product=${encodeURIComponent(p.name)}&product_id=${encodeURIComponent(p.id)}`}
              verificationSteps={p.verificationSteps} l2Scope={p.l2Scope}
              test={p.isDemo}
              comparison={hasProductComparisonPeer(items, p) ? { id: p.id, categorySlug: p.categorySlug } : undefined}
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
            onClick={() => goTo(current - 1)}
            disabled={current === 1}
            aria-label={isVi ? "Trang trước" : "Previous page"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-brand-500 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:text-ink-700"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p
            aria-live="polite"
            className="min-w-14 text-center text-sm font-semibold tabular-nums text-ink-700"
          >
            {current}/{pageCount}
          </p>
          <button
            type="button"
            onClick={() => goTo(current + 1)}
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
