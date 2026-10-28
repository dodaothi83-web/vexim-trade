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
  | "suppliers.delete"
  | "suppliers.publish"
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
  | "kpi.view"
  | "blog.manage"
  /** Xem báo cáo lượt xem toàn website (chỉ admin). */
  | "traffic.view"
  /** Quản lý categories công khai */
  | "categories.view"
  | "categories.manage"
  /** Công khai/huỷ công khai category (admin / trưởng kiểm duyệt) */
  | "categories.publish"
  /** Thực hiện kiểm tra xác minh (inspector) */
  | "verifications.inspect"
  /** Xem đợt kiểm để xét duyệt mà không được sửa bằng chứng */
  | "verifications.view"
  /** Duyệt kết quả xác minh (admin / thu mua / trưởng kiểm duyệt) */
  | "verifications.approve"
  /** Xem RFQ (chỉ đọc, không thao tác) */
  | "rfq.view"
  /** Xử lý RFQ, ghép seller, gửi báo giá cho buyer */
  | "rfq.manage"
  /** Xem danh sách gói đẩy sản phẩm và số liệu */
  | "sponsored.view"
  /** Liên hệ và kết thúc yêu cầu; không cấp quyền duyệt hay sửa gói. */
  | "sponsored.requests.manage"
  /**
   * Tạo, duyệt, tạm dừng gói đẩy. Admin và trưởng kiểm duyệt; ràng buộc dưới cơ sở
   * dữ liệu chỉ nhận hai vai trò này (xem migration 20261029_sponsored_approver_role.sql).
   */
  | "sponsored.manage";

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
      "Nhà cung cấp, sản phẩm, hình ảnh và giấy tờ xác minh nội bộ. Kiểm và duyệt xác minh theo quy trình một nhân sự. Xem buyer ở mức cơ bản.",
    badge: "bg-emerald-600 text-white",
  },
  {
    value: "reviewer",
    label: "Trưởng kiểm duyệt",
    description: "Xét duyệt độc lập các đợt kiểm/chứng nhận, quyết định công khai NCC và danh mục, duyệt gói đẩy sản phẩm; không quản lý tài khoản hay sửa bằng chứng.",
    badge: "bg-violet-700 text-white",
  },
  {
    value: "supplier",
    label: "Doanh nghiệp",
    description: "Chỉ xem hồ sơ của mình và bổ sung giấy tờ bước đầu qua cổng NCC; không vào CRM.",
    badge: "bg-sky-100 text-sky-800",
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
  "settings.view",
  "rfq.view",
];

const MATRIX: Record<UserRole, Permission[]> = {
  admin: [
    "buyers.view",
    "buyers.manage",
    "prospects.manage",
    "suppliers.view",
    "suppliers.manage",
    "suppliers.delete",
    "suppliers.publish",
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
    "blog.manage",
    "traffic.view",
    "categories.manage",
    "categories.publish",
    "verifications.view",
    "verifications.inspect",
    "verifications.approve",
    "rfq.manage",
    "sponsored.view",
    "sponsored.requests.manage",
    "sponsored.manage",
  ],
  sale: [
    "buyers.view",
    "buyers.manage",
    "prospects.manage",
    "suppliers.view",
    "products.view",
    "media.view",
    "mail.view",
    "mail.send",
    "kpi.view",
    "blog.manage",
    "rfq.manage",
    "sponsored.view",
    "sponsored.requests.manage",
    "settings.view",
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
    "categories.manage",
    "rfq.manage",
    "verifications.view",
    "verifications.inspect",
    "verifications.approve",
    "settings.view",
  ],
  reviewer: [
    "suppliers.view",
    "suppliers.publish",
    "products.view",
    "media.view",
    "media.internal",
    "settings.view",
    "categories.view",
    "categories.publish",
    "verifications.view",
    "verifications.approve",
    "sponsored.view",
    "sponsored.requests.manage",
    "sponsored.manage",
  ],
  viewer: VIEW_ONLY,
  supplier: [],
};

export function permissionsFor(role: UserRole): Permission[] {
  return MATRIX[role] ?? []; // Unknown/invalid roles fail closed.
}

export function hasPermission(role: UserRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  const perms = permissionsFor(role);
  if (perms.includes(perm)) return true;
  // Quyền `.manage` tự động cấp `.view` trên cùng domain (trừ trường hợp danh sách trắng riêng).
  if (perm.endsWith(".view")) {
    const domain = perm.slice(0, -".view".length);
    return perms.includes(`${domain}.manage` as Permission);
  }
  return false;
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
