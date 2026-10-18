/**
 * Các tiện ích dùng cho quy trình xác minh (L1/L2/L3).
 * Tách riêng khỏi "use server" file vì Next.js chỉ cho phép export async server actions
 * từ những file có "use server" ở đầu.
 */

import { DELIVERY_ITEMS, L1_DOC_ITEMS, L2_VISIT_ITEMS, type AuditEvidenceKey, type VerificationLevel } from "./types";

export const AUDIT_STEPS = [
  { level: 1, path: "documents", title: "Kiểm tra giấy tờ", short: "Giấy tờ", description: "Đối chiếu giấy phép, chứng nhận và bằng chứng đính kèm." },
  { level: 2, path: "factory", title: "Thăm nhà máy", short: "Nhà máy", description: "Ghi nhận kiểm tra tại cơ sở, địa chỉ, GPS, hình ảnh và video." },
  { level: 3, path: "deliveries", title: "Lịch sử giao hàng", short: "Giao hàng", description: "Đối chiếu một lô hàng đã giao bằng vận đơn và xác nhận giao nhận; RFQ thắng không đủ làm bằng chứng." },
] as const;

export function auditStep(level: number) { return AUDIT_STEPS.find((s) => s.level === level); }
export function auditItems(level: VerificationLevel) {
  return level === 1 ? L1_DOC_ITEMS : level === 2 ? L2_VISIT_ITEMS : DELIVERY_ITEMS;
}

/** Two required L1 items (business registration + mã số thuế dạng số); số tài khoản ngân hàng và các giấy chứng nhận khác là mục tùy chọn. */
export function requiredAuditItems(level: VerificationLevel) {
  return level === 1 ? L1_DOC_ITEMS.filter((item) => item.required) : [];
}

/** Which rows accept uploads; all other rows are notes/structured inputs. */
export function auditUploadKind(level: VerificationLevel, key: AuditEvidenceKey): "image" | "file" | null {
  if (level === 1) return L1_DOC_ITEMS.some((item) => item.key === key) && !["tax_certificate", "bank_letter"].includes(key) ? "file" : null;
  if (level === 2) {
    if (["production_line_seen", "warehouse_seen", "qc_lab_seen", "photos_taken"].includes(key)) return "image";
    return key === "documents_original" ? "file" : null;
  }
  return ["shipping_proof", "delivery_proof"].includes(key) ? "file" : null;
}
export function auditHref(supplierId: string, level: number) {
  const step = auditStep(level);
  return step ? `/crm/suppliers/${encodeURIComponent(supplierId)}/audit/${step.path}` : `/crm/suppliers/${encodeURIComponent(supplierId)}`;
}

/** Ước chừng toạ độ Việt Nam để cảnh báo GPS sai khi thăm nhà máy. */
export function inVnBounds(lat: number | null, lng: number | null): boolean | null {
  if (lat == null || lng == null) return null;
  return lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110;
}
