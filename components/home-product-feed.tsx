"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PublicProductCard } from "@/components/public-product-card";
import { HOME_FEED_PER_PAGE, HOME_FEED_WIDE_QUERY, feedPerPage } from "@/lib/public/supplier-product-order";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";

export type HomeFeedProduct = PublicCategoryProduct & { categorySlug: string };

/** Nhịp tự chuyển trang khi lưới đã ra khỏi màn hình. */
export const AUTO_ADVANCE_MS = 7000;

/**
 * Cắt danh sách thành trang. Tách khỏi phần giao diện để kiểm được bằng số, không
 * cần trình duyệt: trang ngoài dải thì kẹp về đầu hoặc cuối, không trả trang rỗng.
 */
export function pageSlice<T>(items: T[], page: number, perPage: number = HOME_FEED_PER_PAGE) {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const start = (current - 1) * perPage;
  return { shown: items.slice(start, start + perPage), current, pageCount };
}

/**
 * Có được tự chuyển trang hay không.
 *
 * Chỉ chuyển khi lưới đã ra khỏi màn hình, vì đổi thẻ trước mặt người đang đọc là
 * cách chắc chắn nhất để họ bấm nhầm. Thêm bốn điều kiện dừng: người xem đã bấm
 * nút thì thôi không tự chuyển nữa, tab bị ẩn thì dừng, máy đặt giảm chuyển động
 * thì tắt hẳn, và phải đã nhìn thấy lưới ít nhất một lần trước đó. Điều kiện cuối
 * để người mở trang luôn gặp trang một, không rơi vào giữa vòng xoay.
 */
export function autoAdvanceAllowed(input: {
  pageCount: number;
  seen: boolean;
  stopped: boolean;
  tabHidden: boolean;
  onScreen: boolean;
  reducedMotion: boolean;
}): boolean {
  return (
    input.pageCount > 1 &&
    input.seen &&
    !input.stopped &&
    !input.tabHidden &&
    !input.onScreen &&
    !input.reducedMotion
  );
}

/** Trang kế tiếp khi tự chuyển: hết trang cuối thì quay lại trang đầu. */
export function nextAutoPage(current: number, pageCount: number): number {
  return current >= pageCount ? 1 : current + 1;
}

/**
 * Bề rộng màn hình có đủ bốn cột hay không, đọc qua matchMedia.
 *
 * Đọc bằng useSyncExternalStore để lần dựng đầu tiên ở trình duyệt dùng đúng
 * getServerSnapshot (sáu thẻ, hai hàng ba), rồi mới đổi sang tám thẻ, hai hàng
 * bốn. Nhờ vậy bản máy chủ và bản thuỷ hợp khớp nhau, và khối không cao thêm:
 * sáu thẻ ba cột với tám thẻ bốn cột đều là hai hàng.
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
  const [seen, setSeen] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [tabHidden, setTabHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const scrollWanted = useRef(false);
  // Dữ liệu đổi trong lúc đang xem thì kẹp lại, không để rơi vào trang rỗng.
  // Đổi cỡ màn hình thì số thẻ mỗi trang đổi theo; pageSlice tự kẹp số trang,
  // nên không rơi vào trang rỗng khi số trang ít đi.
  const { shown, current, pageCount } = pageSlice(items, page, size);
  const autoAdvance = autoAdvanceAllowed({
    pageCount,
    seen,
    stopped: interacted,
    tabHidden,
    onScreen,
    reducedMotion,
  });

  // Máy đặt giảm chuyển động thì không tự chuyển trang, và cũng không cuộn mượt.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Tab bị ẩn thì dừng nhịp, để không đổi trang trong lúc không ai nhìn.
  useEffect(() => {
    const sync = () => setTabHidden(document.visibilityState === "hidden");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  // Theo dõi lưới còn trong màn hình hay không: tự chuyển chỉ chạy khi đã khuất.
  useEffect(() => {
    const node = listRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setOnScreen(entry.isIntersecting);
          if (entry.isIntersecting) setSeen(true);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoAdvance) return;
    const id = window.setInterval(() => {
      setPage((value) => nextAutoPage(Math.min(value, pageCount), pageCount));
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [autoAdvance, pageCount]);

  // Sang trang do người xem bấm thì kéo lưới vào tầm mắt nếu đã ra khỏi màn hình.
  // Lượt tự chuyển không cuộn, vì lưới đang khuất và cuộn theo sẽ giật trang.
  useEffect(() => {
    if (!scrollWanted.current) return;
    scrollWanted.current = false;
    listRef.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [current, reducedMotion]);

  const goTo = (next: number) => {
    setInteracted(true);
    scrollWanted.current = true;
    setPage(Math.min(Math.max(1, next), pageCount));
  };

  return (
    <>
      <ul
        ref={listRef}
        // Cột thứ tư chỉ bật khi trình duyệt xác nhận màn đủ rộng, cùng lúc với
        // việc nâng lên tám thẻ. Nhờ vậy bản dựng từ máy chủ (sáu thẻ) xếp hai hàng
        // ba, không bao giờ lộ một hàng bốn thẻ cộng hai thẻ lẻ trước khi thuỷ hợp.
        className={`mt-6 grid grid-cols-2 items-stretch gap-3 sm:gap-4 md:grid-cols-3${
          wide ? " lg:grid-cols-4" : ""
        }`}
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
            onClick={() => goTo(current - 1)}
            disabled={current === 1}
            aria-label={isVi ? "Trang trước" : "Previous page"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 transition hover:border-brand-500 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:text-ink-700"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          {/* Lượt tự chuyển không đọc lên, kẻo trình đọc màn hình ngắt lời người dùng. */}
          <p
            aria-live={autoAdvance ? "off" : "polite"}
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
