/**
 * Xác minh email khi đăng ký tài khoản nhà cung cấp.
 *
 * Giai đoạn thử nội bộ: nhân sự Vexim tự đăng ký như một nhà cung cấp để chạy hết
 * luồng thật, nên không phải mở hộp thư xác nhận. Bật bằng biến môi trường
 * `SUPPLIER_SIGNUP_SKIP_EMAIL_CONFIRM=1`; xoá biến đi là xác minh bật lại.
 *
 * Chế độ này chỉ để trong lúc thử, không phải một quyền của người dùng: không có
 * giá trị nào được lưu vào cơ sở dữ liệu, nên không tài khoản nào bị kẹt giữa hai
 * chế độ, và tắt cờ là lần đăng ký sau đã phải xác nhận email như cũ.
 *
 * Bỏ bước xác nhận không nới quyền. Tài khoản vẫn được tạo ở trạng thái đã xác
 * nhận (để đăng nhập được), vẫn không có `supplier_id`, không sản phẩm, không xem
 * RFQ cho tới khi Vexim nhận hồ sơ doanh nghiệp, và mỗi lần tạo đều ghi audit log.
 */
export function signupSkipsEmailConfirmation(): boolean {
  const raw = (process.env.SUPPLIER_SIGNUP_SKIP_EMAIL_CONFIRM ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Câu mô tả chế độ đang chạy, dùng chung cho thông báo và nhật ký. */
export const SKIPPED_CONFIRMATION_AUDIT = "supplier.account_registered_without_email_confirmation";
