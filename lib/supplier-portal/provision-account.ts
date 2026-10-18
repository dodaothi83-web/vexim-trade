import type { AppUserInput, AppUserRecord, Supplier } from "@/lib/types";

/** Phần tầng dữ liệu mà luồng cấp tài khoản cần; tách riêng để kiểm tra độc lập với giao diện. */
export interface SupplierAccountStore {
  getSupplier(id: string): Promise<Supplier | null>;
  getUserBySupplierId(supplierId: string): Promise<AppUserRecord | null>;
  getUserByEmail(email: string): Promise<AppUserRecord | null>;
  createUser(input: AppUserInput): Promise<AppUserRecord>;
  deleteUser(id: string): Promise<void>;
  claimSupplierForUser(userId: string, supplierId: string): Promise<boolean>;
}

export interface ProvisionSupplierAccountInput {
  email: string;
  name?: string | null;
  tempSecret?: string | null;
}

export interface ProvisionSupplierAccountDeps {
  /** Tạo tài khoản đăng nhập bên Supabase Auth (đã xác nhận email); trả về null khi không tạo được. */
  createAuthUser(email: string, password: string): Promise<string | null>;
  /** Kiểm tra mật khẩu tạm; trả về mô tả lỗi hoặc null khi hợp lệ. */
  validatePassword(password: string): string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cấp tài khoản cổng NCC cho một hồ sơ đã có sẵn trong CRM.
 * Hai trường hợp: email đã tự đăng ký tài khoản NCC nhưng chưa gắn doanh nghiệp nào thì
 * gắn tài khoản đó vào hồ sơ này; email chưa có tài khoản thì tạo mới bằng mật khẩu tạm.
 * Mỗi hồ sơ chỉ có một tài khoản; tài khoản nội bộ của nhân viên không bao giờ bị gắn vào hồ sơ.
 */
export async function provisionSupplierAccount(
  store: SupplierAccountStore,
  supplierId: string,
  input: ProvisionSupplierAccountInput,
  deps: ProvisionSupplierAccountDeps,
): Promise<{ mode: "created" | "linked"; user: AppUserRecord }> {
  const supplier = await store.getSupplier(supplierId);
  if (!supplier) throw new Error("Không tìm thấy nhà cung cấp.");

  const email = (input.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Email đăng nhập không hợp lệ.");

  const attached = await store.getUserBySupplierId(supplierId);
  if (attached) {
    throw new Error(`Hồ sơ này đã có tài khoản ${attached.email}. Mỗi nhà cung cấp chỉ có một tài khoản đăng nhập.`);
  }

  const existing = await store.getUserByEmail(email);
  if (existing) {
    if (existing.role !== "supplier") {
      throw new Error("Email này đang dùng cho tài khoản nội bộ của Vexim, không thể cấp cho nhà cung cấp.");
    }
    if (!existing.is_active) {
      throw new Error("Tài khoản với email này đang bị tạm khoá. Quản trị viên cần mở khoá trước khi gắn vào hồ sơ.");
    }
    if (existing.supplier_id === supplierId) {
      throw new Error("Tài khoản này đã gắn với hồ sơ nhà cung cấp hiện tại.");
    }
    if (existing.supplier_id) {
      throw new Error("Email này đã gắn với một nhà cung cấp khác. Mỗi tài khoản chỉ quản lý một doanh nghiệp.");
    }
    const claimed = await store.claimSupplierForUser(existing.id, supplierId);
    if (!claimed) throw new Error("Không gắn được tài khoản vào hồ sơ. Tải lại trang rồi thử lại.");
    return { mode: "linked", user: { ...existing, supplier_id: supplierId } };
  }

  const tempSecret = input.tempSecret ?? "";
  const problem = deps.validatePassword(tempSecret);
  if (problem) throw new Error(`Cần đặt mật khẩu tạm cho tài khoản mới. ${problem}`);

  const user = await store.createUser({
    email,
    name: (input.name ?? "").trim() || supplier.contact_name || supplier.name,
    role: "supplier",
    supplier_id: supplierId,
    auth_provider: "supabase",
    password_hash: null,
    is_active: true,
  });
  const authId = await deps.createAuthUser(email, tempSecret);
  if (!authId) {
    // Tài khoản NCC chỉ đăng nhập được qua Supabase Auth; không giữ lại bản ghi nội bộ không dùng được.
    await store.deleteUser(user.id).catch(() => undefined);
    throw new Error("Chưa tạo được tài khoản đăng nhập bên Supabase Auth. Email có thể đã tồn tại bên Supabase hoặc hệ thống chưa kết nối được. Chưa cấp tài khoản, vui lòng kiểm tra rồi thử lại.");
  }
  return { mode: "created", user };
}
