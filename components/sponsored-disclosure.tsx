/** Visible on every paid card, independent of the surrounding sponsored section. */
export function SponsoredDisclosure() {
  return <div className="mb-2 min-w-0 text-xs">
    <span className="inline-block rounded-md bg-amber-200 px-1.5 py-1 text-[10px] font-bold leading-4 text-amber-950">Sponsored · Tài trợ</span>
    <details className="mt-1 text-ink-600">
      <summary className="cursor-pointer text-[11px] font-semibold leading-4 text-brand-800 underline decoration-brand-300 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">Why am I seeing this?</summary>
      <p className="mt-1 break-words text-[11px] leading-4">This product appears in a paid placement purchased by its supplier for this category. Eligible products rotate. Sponsorship does not change verification results or organic ranking.</p>
      <p className="mt-1 break-words text-[11px] leading-4" lang="vi">Sản phẩm xuất hiện tại vị trí tài trợ do nhà cung cấp mua cho danh mục này. Các sản phẩm đủ điều kiện được chọn luân phiên. Tài trợ không thay đổi kết quả xác minh hoặc thứ hạng tự nhiên.</p>
    </details>
  </div>;
}
