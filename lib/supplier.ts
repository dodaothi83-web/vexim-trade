import type { SupplierRole, SupplierStatus } from "./types";

export const SUPPLIER_ROLES: { value: SupplierRole; label: string }[] = [
  { value: "manufacturer", label: "Nhà sản xuất" },
  { value: "trader", label: "Thương nhân" },
  { value: "agent", label: "Đại lý" },
  { value: "exporter", label: "XK trung gian" },
];

export const SUPPLIER_STATUSES: { value: SupplierStatus; label: string; badge: string; dot: string }[] = [
  { value: "new", label: "Mới", badge: "bg-sky-50 text-sky-700", dot: "bg-sky-400" },
  { value: "verifying", label: "Đang xác minh", badge: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  { value: "verified", label: "Đã xác minh", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  { value: "paused", label: "Tạm ngưng", badge: "bg-ink-100 text-ink-500", dot: "bg-ink-300" },
];

export function roleLabel(role: string): string {
  return SUPPLIER_ROLES.find((r) => r.value === role)?.label ?? role;
}

export function statusMeta(status: string) {
  return (
    SUPPLIER_STATUSES.find((s) => s.value === status) ?? {
      value: "new" as SupplierStatus,
      label: status || "Mới",
      badge: "bg-ink-100 text-ink-500",
      dot: "bg-ink-300",
    }
  );
}

export const PRODUCT_CATEGORIES = [
  "Nông sản",
  "Thủy sản",
  "Gỗ & nội thất",
  "Cà phê & gia vị",
  "Thực phẩm chế biến",
  "Khác",
];
