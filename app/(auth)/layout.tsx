import type { ReactNode } from "react";

/**
 * Route group của trang tài khoản.
 *
 * Mỗi trang tự bọc nội dung bằng `AuthSplitShell` (ảnh bối cảnh bên trái, form bên phải),
 * nên layout này chỉ còn là khung nền — không thêm khung thẻ thứ hai.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
