/**
 * Khung chờ hiện ngay khi bấm Tìm (ô tìm kiếm trên header điều hướng phía client), để
 * người mua thấy trang đã phản hồi thay vì màn hình đứng yên trong lúc server lọc kết quả.
 * Bố cục khớp trang kết quả: cột lọc bên trái, lưới thẻ sản phẩm bên phải.
 */
export default function LoadingSearch() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse px-5 pb-16 pt-6 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading search results">
      <div className="h-4 w-32 rounded bg-ink-100" />
      <div className="mt-5 h-10 w-72 max-w-full rounded-lg bg-ink-100" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-ink-50" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden h-[520px] rounded-2xl bg-ink-50 lg:block" />
        <div>
          <div className="h-10 w-full rounded-xl bg-ink-50 lg:hidden" />
          <div className="mt-4 h-5 w-28 rounded bg-ink-100 lg:mt-0" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
                <div className="aspect-square bg-ink-100" />
                <div className="space-y-2 p-3">
                  <div className="h-4 rounded bg-ink-100" />
                  <div className="h-4 w-2/3 rounded bg-ink-50" />
                  <div className="h-5 w-1/2 rounded bg-ink-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
