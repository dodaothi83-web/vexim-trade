import { after } from "next/server";

/**
 * Chạy một tác vụ phụ SAU khi đã trả kết quả cho người dùng (Next.js `after()`).
 *
 * Dùng cho thông báo email khi gửi RFQ: yêu cầu đã lưu, người mua không cần chờ Resend
 * (150–500 ms mỗi thư, lâu hơn nhiều khi dịch vụ chậm). Tác vụ không bao giờ ném lỗi ra ngoài.
 *
 * Ngoài phạm vi request (script kiểm thử, cron) `after()` ném lỗi → chạy ngay và chờ xong, đúng
 * hành vi cũ, để không bao giờ mất thông báo chỉ vì môi trường không hỗ trợ chạy nền.
 */
export async function afterResponse(label: string, task: () => Promise<unknown>): Promise<void> {
  const safe = async () => {
    try {
      await task();
    } catch (error) {
      console.warn(`[rfq] ${label} failed; the request is already saved:`, error instanceof Error ? error.message : error);
    }
  };
  try {
    after(safe);
  } catch {
    await safe();
  }
}
