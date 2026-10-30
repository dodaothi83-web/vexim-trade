import type { SupplierRole, SupplierStatus, SupplierType } from "./types";

/**
 * Vai trò cũ — giữ cho tương thích với dữ liệu/code đã tồn tại.
 * Code mới (trang công khai + form mới) dùng `supplier_type`.
 */
export const SUPPLIER_ROLES: { value: SupplierRole; label: string }[] = [
  { value: "manufacturer", label: "Nhà sản xuất" },
  { value: "trader",       label: "Thương nhân" },
  { value: "agent",        label: "Đại lý" },
  { value: "exporter",     label: "XK trung gian" },
];

/** Loại hình theo đặc tả GĐ1 */
export const SUPPLIER_TYPES: { value: SupplierType; label: string; hint?: string }[] = [
  { value: "manufacturer", label: "Nhà máy / Xưởng trực tiếp" },
  { value: "trading",      label: "Công ty thương mại / Xuất khẩu", hint: "Không sở hữu xưởng" },
  { value: "cooperative",  label: "Hợp tác xã / Tổ hợp sản xuất" },
];

export const SUPPLIER_STATUSES: { value: SupplierStatus; label: string; badge: string; dot: string; stage: 0 | 1 | 2 | 3 | 4 }[] = [
  // Luồng mới
  { value: "draft",           label: "Bản nháp",              badge: "bg-slate-100 text-slate-700",      dot: "bg-slate-400",   stage: 0 },
  { value: "submitted",       label: "Đã nộp, chờ duyệt",     badge: "bg-sky-50 text-sky-700",           dot: "bg-sky-500",     stage: 1 },
  { value: "in_verification", label: "Đang kiểm tra thực tế", badge: "bg-amber-50 text-amber-700",        dot: "bg-amber-500",   stage: 2 },
  { value: "published",       label: "Đã duyệt – công khai",  badge: "bg-emerald-50 text-emerald-700",   dot: "bg-emerald-500", stage: 3 },
  { value: "suspended",       label: "Tạm ngừng công khai",   badge: "bg-ink-100 text-ink-600",          dot: "bg-ink-400",     stage: 3 },
  { value: "archived",        label: "Đã lưu trữ",             badge: "bg-ink-100 text-ink-500",          dot: "bg-ink-300",     stage: 4 },
  // Tương thích dữ liệu cũ (ánh xạ sang khái niệm mới khi hiển thị)
  { value: "new",             label: "Mới (legacy)",           badge: "bg-slate-100 text-slate-600",       dot: "bg-slate-400",   stage: 0 },
  { value: "verifying",       label: "Đang xác minh (legacy)", badge: "bg-amber-50 text-amber-700",        dot: "bg-amber-400",   stage: 2 },
  { value: "verified",        label: "Đã xác minh (legacy)",   badge: "bg-emerald-50 text-emerald-700",   dot: "bg-emerald-500", stage: 3 },
  { value: "paused",          label: "Tạm ngưng (legacy)",     badge: "bg-ink-100 text-ink-500",          dot: "bg-ink-300",     stage: 3 },
];

export function roleLabel(role: string | null | undefined): string {
  return SUPPLIER_ROLES.find((r) => r.value === role)?.label ?? "—";
}

export function supplierTypeLabel(t: SupplierType | null | undefined): string {
  return SUPPLIER_TYPES.find((x) => x.value === t)?.label ?? "—";
}

export function statusMeta(status: string | null | undefined) {
  return (
    SUPPLIER_STATUSES.find((s) => s.value === status) ?? {
      value: "draft" as SupplierStatus,
      label: status || "Bản nháp",
      badge: "bg-ink-100 text-ink-500",
      dot: "bg-ink-300",
      stage: 0 as const,
    }
  );
}

/**
 * Gợi ý các trạng thái "tiếp theo" hợp lệ theo luồng:
 *   draft -> submitted -> in_verification -> published <-> suspended
 * published/suspended/new/verifying/verified/paused cũng có thể archived.
 */
export function nextStatusOptions(current: string | null | undefined): SupplierStatus[] {
  switch (current) {
    case "draft":
    case "new":
      return ["submitted"];
    case "submitted":
      return ["in_verification", "draft"];
    case "in_verification":
    case "verifying":
      return ["published", "submitted"];
    case "published":
    case "verified":
      return ["suspended", "archived"];
    case "suspended":
    case "paused":
      return ["published", "archived"];
    case "archived":
      return ["draft"];
    default:
      return ["draft", "submitted", "in_verification", "published"];
  }
}

export const PRODUCT_CATEGORIES = [
  "Điều",
  "Nông sản",
  "Thủy sản",
  "Gỗ & nội thất",
  "Cà phê & gia vị",
  "Thực phẩm chế biến",
  "Khác",
];

export const INCOTERM_OPTIONS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
export const VIETNAM_PORTS = ["Cat Lai (HCM)", "Hai Phong", "Da Nang", "Qui Nhon", "Cai Mep", "Can Tho"];
export const EXPORT_MARKETS = ["US", "EU", "UK", "Japan", "Korea", "China", "Middle East", "Australia", "Canada"];
