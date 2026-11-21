import { Pin } from "lucide-react";

/**
 * Thẻ nhỏ một sản phẩm ghim trên thanh "Featured products" (trang nhà cung cấp gói cao cấp): ảnh
 * vuông, nhãn thứ tự ghim, tên một dòng, MOQ và thời gian giao. `rank` do thanh sản phẩm gắn.
 */
export function FeaturedProductTile({ href, name, imagePath, moq, leadTime, linkable = true, rank }: {
  href: string; name: string; imagePath?: string | null; moq: string; leadTime: string; linkable?: boolean; rank?: number;
}) {
  const body = <>
    {imagePath
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={`/public-media/${imagePath.replace(/^\//, "")}`} alt="" loading="lazy" className="size-16 shrink-0 rounded-lg object-cover ring-1 ring-ink-200" />
      : <span aria-hidden="true" className="size-16 shrink-0 rounded-lg bg-ink-100" />}
    <span className="min-w-0 flex-1">
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
        <Pin aria-hidden="true" className="size-3" />Featured{rank ? ` #${rank}` : ""}</span>
      <span className="mt-1 block truncate text-sm font-bold text-ink-900">{name}</span>
      <span className="mt-0.5 block truncate text-xs text-ink-500">MOQ: {moq} · Lead time: {leadTime}</span>
    </span>
  </>;
  const cls = "flex h-full items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 transition";
  return linkable
    ? <a href={href} className={`${cls} hover:border-brand-300 hover:shadow-sm`}>{body}</a>
    : <div className={cls}>{body}</div>;
}
