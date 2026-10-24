import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Huy hiệu "N chờ" ở sidebar được tính trong layout của /crm, không phải trong trang.
 * Server action chỉ gọi revalidatePath("/crm/products") thì trang con được làm mới
 * nhưng khung layout vẫn nằm trong bộ nhớ đệm của trình duyệt, nên sau khi duyệt
 * xong con số vẫn giữ nguyên cho tới khi tải lại cả trang.
 *
 * Gọi hàm này ở cuối mỗi thao tác làm thay đổi số việc đang chờ (duyệt/trả hồ sơ,
 * xác nhận quyền cổng, duyệt sản phẩm, đọc thư, đổi trạng thái buyer...).
 */
export function refreshCrmBadges(): void {
  try {
    revalidatePath("/crm", "layout");
  } catch (error) {
    // Làm mới huy hiệu là việc phụ: không được biến quyết định đã lưu thành lỗi.
    console.error("[crm] không làm mới được huy hiệu sidebar", error);
  }
}
