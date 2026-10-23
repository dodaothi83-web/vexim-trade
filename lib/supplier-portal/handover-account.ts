import type { AppUserRecord } from "@/lib/types";

/**
 * Bàn giao tài khoản cổng nhà cung cấp cho doanh nghiệp.
 *
 * Vexim nạp hồ sơ nhà cung cấp và cấp tài khoản trước, thường bằng email liên hệ
 * hoặc một địa chỉ tạm. Khi đã nói chuyện với doanh nghiệp, nhân viên đổi email
 * đăng nhập sang địa chỉ của họ và đặt mật khẩu mới, rồi gửi cả hai cho họ.
 *
 * Đây không phải đăng ký lại: hồ sơ, giấy tờ, sản phẩm, lịch sử duyệt và nhật ký
 * vẫn nằm nguyên trên cùng một bản ghi người dùng, chỉ đổi chỗ đăng nhập. Tài
 * khoản vẫn ở trạng thái đã xác nhận email, nên doanh nghiệp vào được ngay và
 * không phải chờ thư xác nhận.
 */
export interface HandoverAccountStore {
  getUserBySupplierId(supplierId: string): Promise<AppUserRecord | null>;
  getUserByEmail(email: string): Promise<AppUserRecord | null>;
  updateUser(id: string, patch: Partial<AppUserRecord>): Promise<AppUserRecord>;
}

export interface HandoverSupplierAccountInput {
  /** Email đăng nhập mới của doanh nghiệp. */
  email: string;
  /** Mật khẩu mới, gửi cho doanh nghiệp cùng email. */
  password: string;
}

export interface HandoverSupplierAccountDeps {
  /** Kiểm tra mật khẩu; trả về mô tả lỗi hoặc null khi hợp lệ. */
  validatePassword(password: string): string | null;
  /**
   * Đổi email và mật khẩu bên Supabase Auth ở trạng thái đã xác nhận, không gửi
   * thư xác nhận. Trả về false khi không đổi được.
   */
  handOverAuthUser(currentEmail: string, next: { email: string; password: string }): Promise<boolean>;
}

export interface HandoverSupplierAccountResult {
  user: AppUserRecord;
  previousEmail: string;
  changedEmail: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Đổi email đăng nhập và mật khẩu của tài khoản đang gắn với hồ sơ.
 *
 * Ghi email mới vào `app_users` trước rồi mới đổi bên Supabase Auth, để nếu Auth
 * từ chối thì còn trả bản ghi về email cũ. Làm ngược lại sẽ không có cách nào
 * khôi phục mật khẩu cũ.
 */
export async function handOverSupplierAccount(
  store: HandoverAccountStore,
  supplierId: string,
  input: HandoverSupplierAccountInput,
  deps: HandoverSupplierAccountDeps,
): Promise<HandoverSupplierAccountResult> {
  const account = await store.getUserBySupplierId(supplierId);
  if (!account) {
    throw new Error("Hồ sơ này chưa có tài khoản đăng nhập. Cấp tài khoản trước rồi mới bàn giao.");
  }
  if (account.role !== "supplier") {
    throw new Error("Tài khoản đang gắn với hồ sơ không phải tài khoản nhà cung cấp. Kiểm tra lại ở Cài đặt → Người dùng.");
  }
  if (!account.is_active) {
    throw new Error("Tài khoản đang bị tạm khoá. Mở khoá trước khi bàn giao.");
  }

  // Chụp lại email cũ trước khi ghi: một số kho dữ liệu cập nhật thẳng vào object
  // đang đọc, nên đọc lại `account.email` sau khi cập nhật có thể ra giá trị mới và
  // làm mất khả năng trả về trạng thái cũ.
  const previousEmail = account.email;
  const email = (input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Email đăng nhập không hợp lệ.");
  if (email !== previousEmail) {
    const taken = await store.getUserByEmail(email);
    if (taken) {
      throw new Error(taken.role === "supplier"
        ? "Email này đã gắn với một tài khoản nhà cung cấp khác. Mỗi tài khoản chỉ quản lý một doanh nghiệp."
        : "Email này đang dùng cho tài khoản nội bộ của Vexim, không thể cấp cho nhà cung cấp.");
    }
  }

  const problem = deps.validatePassword(input.password ?? "");
  if (problem) throw new Error(`Cần đặt mật khẩu mới cho doanh nghiệp. ${problem}`);

  const changedEmail = email !== previousEmail;
  let user = account;
  if (changedEmail) user = await store.updateUser(account.id, { email });

  const handedOver = await deps.handOverAuthUser(previousEmail, { email, password: input.password });
  if (!handedOver) {
    if (changedEmail) await store.updateUser(account.id, { email: previousEmail }).catch(() => undefined);
    throw new Error("Chưa đổi được tài khoản đăng nhập bên Supabase Auth. Email đã giữ nguyên, mật khẩu chưa đổi. Kiểm tra kết nối Supabase rồi thử lại.");
  }
  return { user, previousEmail, changedEmail };
}
