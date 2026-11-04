/** Shared entrance only; authentication and role permissions remain in their existing flows. */
export const signInEntryMessages = {
  en: {
    title: "Sign in", caption: "Welcome to Vexim Trade",
    intro: "Choose the account you want to sign in to.",
    buyer: "Buyer", buyerDescription: "View your requests, saved products and account details.",
    supplier: "Supplier", supplierDescription: "Manage your company profile, products and quote requests.",
    staff: "Staff sign in", newAccount: "New to Vexim Trade?", register: "Create an account",
  },
  vi: {
    title: "Đăng nhập", caption: "Chào mừng đến với Vexim Trade",
    intro: "Chọn loại tài khoản bạn muốn đăng nhập.",
    buyer: "Người mua", buyerDescription: "Xem yêu cầu đã gửi, sản phẩm đã lưu và thông tin tài khoản.",
    supplier: "Nhà cung cấp", supplierDescription: "Quản lý hồ sơ doanh nghiệp, sản phẩm và yêu cầu báo giá.",
    staff: "Đăng nhập nhân viên", newAccount: "Bạn chưa có tài khoản?", register: "Tạo tài khoản",
  },
} as const;
