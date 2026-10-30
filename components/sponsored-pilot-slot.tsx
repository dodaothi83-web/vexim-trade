"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, ImageIcon } from "lucide-react";
import { useCookieConsent } from "@/components/cookie-consent";
import type { PublicCategoryProduct } from "@/lib/public/product-catalog";

/** Staging pilot only. Dedicated slot, never an organic rank or verification badge. */
export function SponsoredPilotSlot({ product, ticket, campaignId, categorySlug }: {
  product: PublicCategoryProduct; ticket: string; campaignId: string; categorySlug: string;
}) {
  const root = useRef<HTMLElement>(null);
  const { marketingAllowed } = useCookieConsent();
  const send = (event: "impression" | "click") => {
    if (!marketingAllowed) return;
    try {
      const key = `vexim:pilot:${campaignId}:${event}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last < 30 * 60_000) return;
      sessionStorage.setItem(key, String(Date.now()));
      fetch("/api/public/sponsored-pilot", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, event }), credentials: "same-origin", keepalive: true })
        .then((res) => { if (!res.ok) sessionStorage.removeItem(key); })
        .catch(() => sessionStorage.removeItem(key));
    } catch { /* Measurement must never block navigation. */ }
  };
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) timer = setTimeout(() => send("impression"), 800);
      else clearTimeout(timer);
    }, { threshold: 0.5 });
    observer.observe(node);
    return () => { clearTimeout(timer); observer.disconnect(); };
  // Campaign ticket changes per SSR; cleanup any pending impression when it does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket, campaignId]);
  const href = `/products/${encodeURIComponent(categorySlug)}/${encodeURIComponent(product.id)}`;
  return <section ref={root} aria-label="Sponsored placement" className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4">
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-amber-200 px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-950">Sponsored · Tài trợ</span>
      <span className="text-xs text-amber-900">Paid placement, not a Vexim verification result</span></div>
    <div className="mt-3 flex items-center gap-3 sm:gap-4">
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-ink-300 sm:size-20">
        {product.imagePaths[0] ? <img src={`/public-media/${product.cardImagePath ?? product.imagePaths[0]}`} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="size-7" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1"><p className="line-clamp-1 text-xs font-medium text-ink-600">{product.supplierName}</p>
        <p className="line-clamp-2 text-sm font-bold text-ink-900 sm:text-base">{product.name}</p>
        <p className="mt-1 text-xs text-ink-700">{product.price || "Price on request"} · MOQ {product.moq}</p></div>
      <Link href={href} onClick={() => send("click")}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink-900 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700">View <ArrowRight className="size-3.5" aria-hidden="true" /></Link>
    </div>
  </section>;
}
