import { preconnect } from "react-dom";

import { aplusVideoEmbedUrl } from "@/lib/products/aplus";

/**
 * Làm nóng trình phát Cloudflare Stream để bấm phát là chạy gần như ngay, nhưng KHÔNG tự phát
 * và KHÔNG tải trước đoạn video nào (Cloudflare tính phí theo phút video thực sự được phát).
 *
 * 1. Kết nối sẵn: trang có video thì trình duyệt mở sẵn kết nối tới máy chủ Stream lúc tải trang.
 * 2. Khi người mua có ý định bấm (rê chuột, chạm, hoặc dùng bàn phím đưa tới nút phát), một
 *    iframe ẩn nạp trình phát với `preload=none`, không autoplay: chỉ HTML + JavaScript của trình
 *    phát vào bộ nhớ đệm trình duyệt. Lúc bấm, iframe thật lấy chúng từ bộ nhớ đệm.
 *
 * Video vẫn phát qua iframe của Cloudflare trên tên miền Vexim, nên lớp "chỉ phát trên tên miền
 * Vexim" giữ nguyên; Vexim không tự lưu hay chuyển tiếp video.
 */
export const STREAM_ORIGINS = ["https://iframe.videodelivery.net", "https://videodelivery.net"] as const;

/** Gọi trong lúc render của thành phần có video: React gom thành thẻ <link rel="preconnect"> trong <head>. */
export function preconnectStream(): void {
  for (const origin of STREAM_ORIGINS) preconnect(origin);
}

/** Mỗi video chỉ làm nóng một lần; tối đa vài video mỗi trang để không nạp thừa trình phát. */
const warmed = new Set<string>();
const MAX_WARM_PER_PAGE = 3;
/** Giữ iframe ẩn thêm một lúc sau khi nạp xong để trình phát kịp tải các phần nạp sau. */
const WARM_IFRAME_LIFETIME_MS = 20_000;

export function warmStreamPlayer(uid: string): void {
  if (typeof document === "undefined" || !uid || warmed.has(uid) || warmed.size >= MAX_WARM_PER_PAGE) return;
  warmed.add(uid);
  preconnectStream();
  const frame = document.createElement("iframe");
  // Không autoplay, preload=none: không phát, không tải đoạn video, không tính phút xem.
  frame.src = aplusVideoEmbedUrl(uid);
  frame.title = "";
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("data-stream-warmup", uid);
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  frame.addEventListener("load", () => { window.setTimeout(() => frame.remove(), WARM_IFRAME_LIFETIME_MS); }, { once: true });
  document.body.appendChild(frame);
}

/** Gắn vào nút phát / ô video: rê chuột, chạm (pointerdown đến trước click) hoặc focus bàn phím. */
export function streamIntentHandlers(uid: string) {
  const warm = () => warmStreamPlayer(uid);
  return { onPointerEnter: warm, onPointerDown: warm, onFocus: warm };
}
