"use client";

import { useEffect, useRef } from "react";

import { PublicProductCard } from "@/components/public-product-card";
import { useCookieConsent } from "@/components/cookie-consent";
import { cookieConsentFromDocument } from "@/lib/cookie-consent";
import type { SponsoredBandItem } from "@/lib/public/sponsored-band";
import { hasProductComparisonPeer } from "@/lib/public/product-comparison";

/**
 * Vùng đẩy sản phẩm: tối đa ba thẻ, nằm trên lưới tự nhiên, luôn có nhãn nhìn
 * thấy được mà không cần trỏ chuột vào.
 *
 * Thẻ dùng lại đúng thẻ sản phẩm của lưới tự nhiên, kể cả huy hiệu xác minh, để
 * người mua không phải học một kiểu thẻ thứ hai và để một nhà cung cấp đã xác
 * minh không bị hiển thị như chưa xác minh chỉ vì họ mua gói.
 *
 * Đo lường theo quy ước của bản thử nghiệm: hiển thị khi thẻ nằm trong khung nhìn
 * ít nhất một nửa và giữ được 800 mili giây, chỉ ghi khi người xem đã đồng ý đo
 * lường tiếp thị, mỗi gói mỗi loại sự kiện chỉ ghi một lần trong 30 phút trên mỗi
 * tab. Ghi lỗi không bao giờ chặn việc mở trang.
 */
export function SponsoredProductBand({ items, categorySlug, comparisonEnabled = true }: {
  items: SponsoredBandItem[];
  categorySlug: string;
  comparisonEnabled?: boolean;
}) {
  const comparisonOffers = items.map(({ product }) => ({
    id: product.id, supplierId: product.supplierId, categorySlug, isDemo: product.isDemo,
  }));
  const comparableProductIds = new Set(comparisonOffers.filter((product) =>
    hasProductComparisonPeer(comparisonOffers, product)
  ).map((product) => product.id));
  if (items.length === 0) return null;
  return (
    <section aria-label="Sponsored products" className="mb-5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-amber-200 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-950">
          Sponsored · Tài trợ
        </span>
        <p className="text-xs leading-5 text-amber-900">
          Paid placement, not a Vexim verification result. Thứ tự trả phí, không phải kết quả xác minh của Vexim.
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3">
        {items.map((item) => (
          <SponsoredBandCard key={item.push.id} item={item} categorySlug={categorySlug}
            comparisonEnabled={comparisonEnabled && comparableProductIds.has(item.product.id)} />
        ))}
      </div>
    </section>
  );
}

function SponsoredBandCard({ item, categorySlug, comparisonEnabled }: { item: SponsoredBandItem; categorySlug: string; comparisonEnabled: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const { marketingAllowed } = useCookieConsent();
  const { push, product } = item;

  const send = (event: "impression" | "click") => {
    if (!marketingAllowed || cookieConsentFromDocument(document.cookie)?.marketing !== true) return;
    try {
      const key = `vexim:push:${push.id}:${event}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 30 * 60_000) return;
      sessionStorage.setItem(key, String(Date.now()));
      fetch("/api/public/sponsored-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushId: push.id, event }),
        credentials: "same-origin",
        keepalive: true,
      })
        .then((res) => { if (!res.ok) sessionStorage.removeItem(key); })
        .catch(() => sessionStorage.removeItem(key));
    } catch { /* Ghi nhận lỗi không được làm hỏng việc mở trang. */ }
  };

  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sufficientlyVisible = false;
    const restartTimer = () => {
      clearTimeout(timer);
      if (sufficientlyVisible && document.visibilityState === "visible") {
        timer = setTimeout(() => {
          if (document.visibilityState === "visible") send("impression");
        }, 800);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      sufficientlyVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      restartTimer();
    }, { threshold: 0.5 });
    observer.observe(node);
    // IntersectionObserver may not fire again when the user returns to a tab
    // whose card stayed in the same place. Start a fresh 800 ms on return.
    const onVisibilityChange = () => restartTimer();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  // Gói đổi theo cửa sổ luân phiên; huỷ mọi lượt hiển thị đang chờ khi gói đổi.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push.id, marketingAllowed]);

  const href = `/products/${encodeURIComponent(categorySlug)}/${encodeURIComponent(product.id)}`;
  return (
    <div ref={root} className="min-w-0" onClickCapture={(event) => {
      if ((event.target as Element).closest("a[href]")) send("click");
    }}>
      <PublicProductCard
        href={href}
        sponsored
        imagePath={product.cardImagePath ?? product.imagePaths[0]}
        name={product.name}
        moq={product.moq}
        price={product.price}
        fob={product.incoterm?.toUpperCase() === "FOB"}
        leadTimeDays={product.leadTimeDays}
        supplierName={product.supplierName}
        supplierHref={`/suppliers/${encodeURIComponent(product.supplierSlug || product.supplierId)}`}
        quoteHref={product.isDemo ? undefined : `/rfq?category=${encodeURIComponent(categorySlug)}&suppliers=${encodeURIComponent(product.supplierId)}&product=${encodeURIComponent(product.name)}&product_id=${encodeURIComponent(product.id)}`}
        oem={product.oem}
        odm={product.odm}
        samples={product.samples}
        verificationSteps={product.verificationSteps} l2Scope={product.l2Scope}
        test={product.isDemo}
        comparison={comparisonEnabled && !product.isDemo ? { id: product.id, categorySlug } : undefined}
      />
    </div>
  );
}
