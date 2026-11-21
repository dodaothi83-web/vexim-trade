"use client";

import { cloneElement, isValidElement, useState, type ReactNode } from "react";

import { SupplierProductRail } from "./supplier-product-rail";
import { STOREFRONT_GROUP_MIN_PRODUCTS, STOREFRONT_MAX_FEATURED } from "@/lib/storefront-theme";

/** `node`: thẻ cho thanh trượt; `gridNode`: cùng thẻ cho lưới sản phẩm ghim. */
type Item = { id: string; category: { key: string; label: string } | null; node: ReactNode; gridNode: ReactNode };

/**
 * Lưới cột theo số thẻ, để ít sản phẩm (1–3) vẫn cân đối, không để ô trống: 1 thẻ rộng vừa phải,
 * 2–3 thẻ chia đều, 4 thẻ 4 cột, 5–6 thẻ 3 cột, từ 7 thẻ 4 cột.
 */
function columns(count: number): string {
  if (count <= 1) return "grid-cols-1 sm:max-w-sm";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2 lg:max-w-3xl";
  if (count === 3) return "grid-cols-1 sm:grid-cols-3";
  if (count === 4) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  if (count <= 6) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

/**
 * Khu sản phẩm trang nhà cung cấp gói cao cấp (chủ sàn chốt 2026-11-20):
 * - tối đa 4 sản phẩm ghim hiện trước ("Featured products");
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
    {featured.length > 0 && <div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-ink-500">Featured products</h3>
      <ul aria-label="Featured products" className={`mt-3 grid items-stretch gap-4 ${columns(featured.length)}`}>{featured.map((item) => item.gridNode)}</ul>
    </div>}
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
