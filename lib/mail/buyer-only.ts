import type { EmailMessage } from "@/lib/types";

/**
 * Tạm thời: Hộp thư không hiển thị thư của nhà cung cấp (direction = "supplier").
 * Thư của buyer và của khách hàng mục tiêu (prospect) vẫn hiển thị như cũ.
 * Dùng chung cho danh sách Hộp thư, badge chưa đọc ở menu và trang chi tiết thư.
 * Muốn mở lại thư NCC thì chỉ cần sửa hàm này.
 */
export function isBuyerMailMessage(message: Pick<EmailMessage, "direction">): boolean {
  return message.direction === "buyer";
}
