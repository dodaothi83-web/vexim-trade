"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Video } from "lucide-react";

import { VeximIcon } from "@/components/brand/vexim-icons";
import { fill } from "@/lib/i18n/format";
import type { ShowcaseMessages } from "@/lib/i18n/portal/showcase";
import { STOREFRONT_MAX_FEATURED, STOREFRONT_TONE_COLORS, type StorefrontTheme } from "@/lib/storefront-theme";
import { ThemeEditor, type ThemeProductOption, type ThemeTab } from "./theme-editor";

/**
 * Khu "Thiết kế trang" trên "Trang của tôi" (gói Premium/Pro): ba thẻ tóm tắt Đầu trang, Sản phẩm
 * ghim, Nội dung A+ doanh nghiệp. Mỗi thẻ cho biết đã làm gì và có một nút; phần chỉnh mở trong ngăn
 * trượt bên phải nên bản xem trước bên dưới luôn trong tầm mắt. A+ doanh nghiệp soạn ở trang riêng.
 */
export function StorefrontDesignHub({ theme, copy, products, videoErrors, aplusCount }: {
  theme: StorefrontTheme; copy: ShowcaseMessages["theme"]; products: ThemeProductOption[];
  videoErrors: { video: string; videoTooLong: string; upload: string }; aplusCount: number;
}) {
  const h = copy.hub;
  const [drawer, setDrawer] = useState<ThemeTab | null>(null);
  const close = useCallback(() => setDrawer(null), []);
  const pinned = theme.featured.map((id) => products.find((p) => p.id === id)).filter((p): p is ThemeProductOption => !!p);
  const tagline = theme.tagline_vi || theme.tagline;
  const card = "flex min-w-0 flex-col rounded-xl border border-ink-200 bg-white p-4";
  const title = "text-[13px] font-bold text-ink-900";
  const editButton = "mt-auto inline-flex w-fit items-center rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-[13px] font-semibold text-ink-800 hover:border-brand-300 hover:text-brand-800";

  return <section aria-labelledby="design-hub-title" className="mb-6">
    <div className="mb-3">
      <h2 id="design-hub-title" className="text-[15px] font-bold text-ink-900">{h.title}</h2>
      <p className="mt-0.5 text-xs leading-5 text-ink-500">{h.sub}</p>
    </div>
    <div className="grid gap-3 md:grid-cols-3">
      {/* Đầu trang */}
      <div className={card}>
        <p className={title}>{h.header.title}</p>
        <div className="mb-4 mt-2.5 space-y-1.5 text-[12.5px] text-ink-600">
          <p className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: STOREFRONT_TONE_COLORS[theme.tone].accent }} />
            {copy.tone}: <span className="font-semibold text-ink-800">{copy.tones[theme.tone]}</span></p>
          <p className={`line-clamp-2 ${tagline ? "text-ink-800" : "text-ink-400"}`}>{tagline ? `“${tagline}”` : h.header.noTagline}</p>
          <p className="flex items-center gap-1.5"><Video aria-hidden="true" className={`size-3.5 shrink-0 ${theme.hero_video ? "text-success" : "text-ink-400"}`} />{theme.hero_video ? h.header.video : h.header.noVideo}</p>
          <p>{theme.stats.length ? fill(h.header.stats, { count: theme.stats.length }) : h.header.noStats}</p>
        </div>
        <button type="button" onClick={() => setDrawer("header")} className={editButton}>{h.header.edit}</button>
      </div>

      {/* Sản phẩm ghim */}
      <div className={card}>
        <p className={title}>{h.pins.title}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-600">{pinned.length ? fill(h.pins.count, { count: pinned.length }) : h.pins.empty}</p>
        <div className="mb-4 mt-2.5 grid grid-cols-4 gap-2">
          {Array.from({ length: STOREFRONT_MAX_FEATURED }, (_, i) => {
            const product = pinned[i];
            // eslint-disable-next-line @next/next/no-img-element
            return product?.imageUrl ? <img key={i} src={product.imageUrl} alt={product.name} title={product.name} className="aspect-square w-full rounded-lg object-cover ring-1 ring-ink-200" />
              : <span key={i} aria-hidden="true" className={`aspect-square w-full rounded-lg ${product ? "bg-ink-100" : "border border-dashed border-ink-200 bg-ink-50/60"}`} />;
          })}
        </div>
        <button type="button" onClick={() => setDrawer("pins")} className={editButton}>{h.pins.edit}</button>
      </div>

      {/* Nội dung A+ doanh nghiệp */}
      <div className={`${card} border-brand-200 bg-gradient-to-br from-brand-50 to-white`}>
        <div className="flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-brand-200"><VeximIcon name="document" className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className={title}>{h.aplus.title}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-600">{aplusCount ? fill(h.aplus.count, { count: aplusCount }) : h.aplus.empty}</p>
          </div>
        </div>
        <p className="mb-4 mt-2.5 text-[12.5px] leading-5 text-ink-600">{h.aplus.hint}</p>
        <Link href="/supplier/portal/storefront/company"
          className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-brand-900 px-3.5 py-1.5 text-[13px] font-bold text-white shadow-sm transition hover:from-brand-700 hover:to-ink-900">
          <VeximIcon name="document" className="size-4" aria-hidden="true" />{h.aplus.open}</Link>
      </div>
    </div>

    {drawer && <ThemeEditor initial={theme} copy={copy} products={products} videoErrors={videoErrors} tab={drawer} onTab={setDrawer} onClose={close} />}
  </section>;
}
