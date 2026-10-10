import type { EmailMessage } from "@/lib/types";

/**
 * Tạm thời: Hộp thư chỉ hiển thị thư của BUYER.
 * - Loại thư của nhà cung cấp (direction = "supplier").
 * - Loại thư gắn với khách hàng mục tiêu (prospect), vì đó không phải buyer.
 * Dùng chung cho danh sách Hộp thư, badge chưa đọc ở menu và trang chi tiết thư.
 * Muốn mở lại thư NCC hay prospect thì chỉ cần sửa hàm này.
 */
export function isBuyerMailMessage(message: Pick<EmailMessage, "direction" | "prospect_id">): boolean {
  return message.direction === "buyer" && !message.prospect_id;
}
