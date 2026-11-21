"use client";

import { Children, Fragment, cloneElement, isValidElement, useEffect, useState, type ReactNode } from "react";
import { Pin } from "lucide-react";

import { SupplierProductRail } from "./supplier-product-rail";
import { STOREFRONT_GROUP_MIN_PRODUCTS, STOREFRONT_MAX_FEATURED } from "@/lib/storefront-theme";

/** `node`: thẻ đầy đủ cho thanh trượt; `featuredNode`: thẻ nhỏ cho thanh sản phẩm ghim. */
type Item = { id: string; category: { key: string; label: string } | null; node: ReactNode; featuredNode: ReactNode };

/**
 * Khu sản phẩm trang nhà cung cấp gói cao cấp (chủ sàn chốt 2026-11-20):
 * - tối đa 4 sản phẩm ghim trên thanh "Featured products" nhỏ gọn (2 thẻ một lượt, quá 2 thì tự chuyển);
 * - từ 8 sản phẩm trở lên và có từ 2 danh mục thì có nút lọc theo danh mục;
 * - các sản phẩm còn lại nằm trên thanh trượt (3 thẻ và một phần thẻ thứ 4).
 * Mọi thẻ vẫn nằm trong trang (chỉ ẩn bằng CSS khi lọc) để máy tìm kiếm đọc đủ.
 */
export function PremiumProductGrid({ items, featuredIds }: { items: Item[]; featuredIds: string[] }) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const featured = featuredIds.map((id) => byId.get(id)).filter((item): item is Item => !!item).slice(0, STOREFRONT_MAX_FEATURED);
  const pinned = new Set(featured.map((item) => item.id));
  const rest = items.filter((item) => !pinned.has(item.id));
  const groups = [...new Map(rest.flatMap((item) => item.category ? [[item.category.key, item.category.label] as const] : [])).entries()];
  const filterable = items.length >= STOREFRONT_GROUP_MIN_PRODUCTS && groups.length >= 2;
  const [active, setActive] = useState<string | null>(null);
  const shown = active ? rest.filter((item) => item.category?.key === active) : rest;
  const chip = (on: boolean) => `whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold transition ${on ? "border-[var(--sf-accent,#1F3E74)] bg-[var(--sf-accent,#1F3E74)] text-white" : "border-ink-200 bg-white text-ink-700 hover:border-ink-300"}`;
  return <div className="mt-5 space-y-8">
    {featured.length > 0 && <FeaturedStrip>{featured.map((item) => <Fragment key={item.id}>{item.featuredNode}</Fragment>)}</FeaturedStrip>}
    {rest.length > 0 && <div>
      {featured.length > 0 && <h3 className="text-sm font-bold uppercase tracking-wider text-ink-500">{filterable ? "Browse by category" : "More products"}</h3>}
      {filterable && <div role="group" aria-label="Filter products by category" className="mt-3 flex gap-2 overflow-x-auto pb-1">
        <button type="button" aria-pressed={active === null} onClick={() => setActive(null)} className={chip(active === null)}>All ({rest.length})</button>
        {groups.map(([key, label]) => <button key={key} type="button" aria-pressed={active === key} onClick={() => setActive(key)} className={chip(active === key)}>
          {label} ({rest.filter((item) => item.category?.key === key).length})</button>)}
      </div>}
      <SupplierProductRail productCount={shown.length}>
        {rest.map((item) => <ProductSlot key={item.id} hidden={active !== null && item.category?.key !== active}>{item.node}</ProductSlot>)}
      </SupplierProductRail>
    </div>}
  </div>;
}

/** Thẻ đang bị lọc thì ẩn bằng CSS (vẫn là <li> trong HTML để máy tìm kiếm đọc đủ). */
function ProductSlot({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  if (!hidden || !isValidElement<{ className?: string }>(children)) return <>{children}</>;
  return cloneElement(children, { className: `${children.props.className ?? ""} hidden` });
}

const ROTATE_MS = 5000;

/**
 * Thanh "Featured products": mỗi lượt 2 thẻ nhỏ. Quá 2 sản phẩm thì tự chuyển lượt sau vài giây bằng
 * hiệu ứng mờ dần (dừng khi rê chuột, bấm vào, hoặc khi người dùng tắt chuyển động); chấm bên dưới
 * để chọn lượt. Mọi thẻ vẫn nằm trong trang (lượt ẩn chỉ mờ đi) để máy tìm kiếm đọc đủ.
 */
function FeaturedStrip({ children }: { children: ReactNode }) {
  const tiles = Children.toArray(children);
  const pages = Array.from({ length: Math.ceil(tiles.length / 2) }, (_, i) => tiles.slice(i * 2, i * 2 + 2));
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (pages.length < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setPage((current) => (current + 1) % pages.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [pages.length, paused]);
  return <section aria-label="Featured products" className="rounded-2xl border border-brand-200 bg-brand-50/50 p-4"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink-900"><Pin aria-hidden="true" className="size-4 text-brand-700" />Featured products</h3>
      {pages.length > 1 && <div className="flex items-center gap-1.5">
        {pages.map((_, i) => <button key={i} type="button" aria-label={`Show featured products ${i * 2 + 1}–${Math.min(i * 2 + 2, tiles.length)}`} aria-pressed={page === i}
          onClick={() => setPage(i)} className={`h-1.5 rounded-full transition-all ${page === i ? "w-5 bg-brand-700" : "w-1.5 bg-brand-200 hover:bg-brand-300"}`} />)}
      </div>}
    </div>
    <div className="grid">
      {pages.map((group, i) => <ul key={i} aria-hidden={page !== i} inert={page !== i}
        className={`col-start-1 row-start-1 grid gap-3 transition-opacity duration-700 sm:grid-cols-2 ${page === i ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        {group.map((tile, k) => <li key={k} className="min-w-0">{tile}</li>)}
      </ul>)}
    </div>
  </section>;
}
