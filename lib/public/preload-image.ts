/**
 * Tải trước ảnh vào bộ nhớ đệm của trình duyệt để lúc mở ra là hiện ngay.
 *
 * Dùng cho ảnh chứng nhận trên trang sản phẩm: thẻ không có ảnh thu nhỏ nên trước đây
 * ảnh chỉ bắt đầu tải khi người mua bấm vào. Có hai lúc tải trước:
 * - khi người mua có ý định mở (rê chuột, chạm tay, tab tới thẻ), luôn tải;
 * - khi trang đã rảnh, chỉ tải vài ảnh đầu và bỏ qua nếu người dùng bật tiết kiệm dữ liệu
 *   hoặc mạng chậm, để người xem lướt trên 3G không tốn dung lượng vô ích.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */

const requested = new Set<string>();
/** Giữ tham chiếu tới ảnh đang tải để trình duyệt không bỏ dở khi dọn bộ nhớ. */
const inFlight = new Set<HTMLImageElement>();

export function preloadImage(url: string | null | undefined): void {
  if (!url || typeof window === "undefined" || typeof Image === "undefined") return;
  if (requested.has(url)) return;
  requested.add(url);
  const image = new Image();
  image.decoding = "async";
  const done = () => inFlight.delete(image);
  image.onload = done;
  image.onerror = () => {
    done();
    // Cho phép thử lại ở lần có ý định mở sau nếu lần này lỗi mạng.
    requested.delete(url);
  };
  inFlight.add(image);
  image.src = url;
}

type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

/** Tải ngầm khi rảnh chỉ trên mạng đủ nhanh và khi người dùng không bật tiết kiệm dữ liệu. */
export function canPreloadInBackground(connection?: NetworkInformationLike | null): boolean {
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g", "3g"].includes(connection.effectiveType ?? "");
}

/** Chạy việc khi trình duyệt rảnh, sau khi trang đã tải xong. Trả về hàm huỷ. */
export function whenPageIdle(task: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let cancelled = false;
  let idleHandle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(() => { if (!cancelled) task(); }, { timeout: 4000 });
    } else {
      timer = setTimeout(() => { if (!cancelled) task(); }, 1500);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });

  return () => {
    cancelled = true;
    window.removeEventListener("load", schedule);
    if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleHandle);
    if (timer !== undefined) clearTimeout(timer);
  };
}
