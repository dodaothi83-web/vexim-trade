/**
 * Góc tiếp cận cho nút AI trong trình soạn thư.
 * Để riêng vì lib/ai/first-touch-draft.ts là "server-only" — client chỉ cần danh sách này.
 */
export const FIRST_TOUCH_ANGLES: { value: string; label: string }[] = [
  { value: "auto", label: "Tự chọn (mỗi lần một khác)" },
  { value: "nguồn cung không ổn định hoặc phụ thuộc quá ít nhà cung cấp", label: "Thiếu nguồn cung" },
  { value: "mùa cao điểm đang đến gần, cần chốt nguồn sớm", label: "Mùa cao điểm" },
  { value: "muốn mở rộng hoặc đa dạng hoá danh mục sản phẩm", label: "Đa dạng sản phẩm" },
  { value: "chất lượng và độ đồng đều giữa các lô, cần kiểm tra trước khi gửi hàng", label: "Chất lượng" },
  { value: "giá và điều khoản thanh toán minh bạch, không chênh lệch qua trung gian", label: "Giá & điều khoản" },
];
