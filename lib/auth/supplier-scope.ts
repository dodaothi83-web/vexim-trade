/**
 * Phạm vi nhà cung cấp theo người phụ trách.
 *
 * - Vai trò `sale` chỉ thấy và thao tác nhà cung cấp có `owner_user_id` là tài khoản của mình,
 *   kèm mọi thứ thuộc nhà cung cấp đó (sản phẩm, giấy tờ, chứng nhận, đợt kiểm, gói dịch vụ).
 * - Các vai trò khác giữ nguyên phạm vi theo quyền hiện có (xem toàn bộ).
 *
 * File này không import server-only để giao diện dùng chung khi ẩn/hiện nút;
 * máy chủ luôn kiểm tra lại qua `lib/auth/supplier-access.ts`.
 */
export interface SupplierScopeUser {
  uid: string;
  role: string;
}

export interface SupplierOwned {
  owner_user_id?: string | null;
}

/** Vai trò bị giới hạn theo nhà cung cấp mình phụ trách. */
export function isSupplierScopedRole(role: string | null | undefined): boolean {
  return role === "sale";
}

/** Trả về id tài khoản cần lọc theo, hoặc null nếu người dùng được xem tất cả. */
export function supplierOwnerScope(user: SupplierScopeUser | null | undefined): string | null {
  if (!user || !isSupplierScopedRole(user.role)) return null;
  // Không có id thì không thấy gì (fail closed).
  return user.uid || "__no_owner__";
}

export function ownsSupplier(user: SupplierScopeUser | null | undefined, supplier: SupplierOwned | null | undefined): boolean {
  if (!user || !supplier) return false;
  const scope = supplierOwnerScope(user);
  if (scope === null) return true;
  return (supplier.owner_user_id ?? "") === scope;
}

export function filterOwnedSuppliers<T extends SupplierOwned>(user: SupplierScopeUser | null | undefined, rows: T[]): T[] {
  const scope = supplierOwnerScope(user);
  if (scope === null) return rows;
  return rows.filter((row) => (row.owner_user_id ?? "") === scope);
}

/** Lọc bản ghi con (sản phẩm, chứng nhận, đợt kiểm...) theo tập nhà cung cấp được phép. */
export function filterBySupplierIds<T extends { supplier_id?: string | null }>(allowed: ReadonlySet<string> | null, rows: T[]): T[] {
  if (allowed === null) return rows;
  return rows.filter((row) => !!row.supplier_id && allowed.has(row.supplier_id));
}

/**
 * Vai trò được ra quyết định trên hồ sơ nhà cung cấp (duyệt tài khoản, sản phẩm, liên kết
 * chứng nhận, cấp/bàn giao tài khoản cổng). Kinh doanh chỉ với NCC mình phụ trách.
 */
export function canDecideSupplierRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "reviewer" || role === "sale";
}
