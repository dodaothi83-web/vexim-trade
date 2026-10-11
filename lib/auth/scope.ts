/**
 * Phạm vi dữ liệu theo người phụ trách.
 *
 * - Vai trò `sale` chỉ thấy và thao tác buyer/prospect có `owner` trùng tên của mình.
 * - `admin` và các vai trò khác giữ nguyên quyền xem toàn bộ (không đổi hành vi hiện tại).
 *
 * Lưu ý: `owner` hiện là tên hiển thị (text), không phải khoá ngoại. So khớp không phân biệt hoa thường.
 */
export interface ScopedUser {
  role: string;
  name: string | null | undefined;
}

/** Trả về tên phụ trách cần lọc, hoặc null nếu người dùng được xem tất cả. */
export function ownerScopeOf(user: ScopedUser | null | undefined): string | null {
  if (!user || user.role !== "sale") return null;
  const name = (user.name ?? "").trim();
  // Không có tên thì không được xem gì (fail closed), trả chuỗi không khớp được.
  return name || "__no_owner__";
}

export function isOwnedBy(owner: string | null | undefined, scope: string | null): boolean {
  if (scope === null) return true;
  return (owner ?? "").trim().toLowerCase() === scope.toLowerCase();
}
