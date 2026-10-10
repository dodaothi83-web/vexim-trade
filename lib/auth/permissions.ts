import type { UserRole } from "@/lib/types";

/**
 * Phân quyền theo vai trò (RBAC).
 *
 * File này KHÔNG import server-only vì giao diện cũng cần để ẩn/hiện nút.
 * Quyền thật luôn được kiểm tra lại ở server (server actions + route API).
 */

export type Permission =
  | "buyers.view"
  | "buyers.manage"
  | "prospects.manage"
  | "suppliers.view"
  | "suppliers.manage"
  | "products.view"
  | "products.manage"
  | "media.view"
  | "media.manage"
  /** Xem giấy tờ xác minh / tài liệu nội bộ của NCC */
  | "media.internal"
  | "mail.view"
  | "mail.send"
  | "templates.manage"
  | "settings.view"
  | "users.manage"
  | "kpi.view";

export const ROLES: {
  value: UserRole;
  label: string;
  description: string;
  badge: string;
}[] = [
  {
    value: "admin",
    label: "Quản trị",
    description:
      "Toàn quyền: buyer, NCC, sản phẩm, email, tài liệu nội bộ và quản lý tài khoản.",
    badge: "bg-ink-900 text-white",
  },
  {
    value: "sale",
    label: "Kinh doanh",
    description:
      "Buyer, prospect, pipeline, email và tài liệu chia sẻ buyer. Xem NCC/sản phẩm nhưng không sửa.",
    badge: "bg-brand-600 text-white",
  },
  {
    value: "sourcing",
    label: "Thu mua",
    description:
      "Nhà cung cấp, sản phẩm, hình ảnh và giấy tờ xác minh nội bộ. Xem buyer ở mức cơ bản.",
    badge: "bg-emerald-600 text-white",
  },
  {
    value: "viewer",
    label: "Chỉ xem",
    description: "Chỉ đọc dữ liệu và xem tài liệu chia sẻ buyer, không thao tác.",
    badge: "bg-ink-200 text-ink-700",
  },
];

const VIEW_ONLY: Permission[] = [
  "buyers.view",
  "suppliers.view",
  "products.view",
  "media.view",
  "mail.view",
];

const MATRIX: Record<UserRole, Permission[]> = {
  admin: [
    "buyers.view",
    "buyers.manage",
    "prospects.manage",
    "suppliers.view",
    "suppliers.manage",
    "products.view",
    "products.manage",
    "media.view",
    "media.manage",
    "media.internal",
    "mail.view",
    "mail.send",
    "templates.manage",
    "settings.view",
    "users.manage",
    "kpi.view",
  ],
  sale: [
    "buyers.view",
    "buyers.manage",
    "prospects.manage",
    "suppliers.view",
    "products.view",
    "media.view",
    "media.manage",
    "mail.view",
    "mail.send",
    "kpi.view",
  ],
  sourcing: [
    "buyers.view",
    "suppliers.view",
    "suppliers.manage",
    "products.view",
    "products.manage",
    "media.view",
    "media.manage",
    "media.internal",
    "mail.view",
    "mail.send",
  ],
  viewer: VIEW_ONLY,
};

export function permissionsFor(role: UserRole): Permission[] {
  return MATRIX[role] ?? VIEW_ONLY;
}

export function hasPermission(role: UserRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return permissionsFor(role).includes(perm);
}

export function roleLabel(role: UserRole | string): string {
  return ROLES.find((r) => r.value === role)?.label ?? String(role);
}

export function roleMeta(role: UserRole | string) {
  return (
    ROLES.find((r) => r.value === role) ?? {
      value: "viewer" as UserRole,
      label: String(role),
      description: "",
      badge: "bg-ink-200 text-ink-700",
    }
  );
}
