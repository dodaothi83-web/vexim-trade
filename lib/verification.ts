/**
 * Các tiện ích dùng cho quy trình xác minh (L1/L2/L3).
 * Tách riêng khỏi "use server" file vì Next.js chỉ cho phép export async server actions
 * từ những file có "use server" ở đầu.
 */

import { DELIVERY_ITEMS, L1_DOC_ITEMS, L2_VISIT_ITEMS, type VerificationLevel } from "./types";

export const AUDIT_STEPS = [
  { level: 1, path: "documents", title: "Kiểm tra giấy tờ", short: "Giấy tờ", description: "Đối chiếu giấy phép, chứng nhận và bằng chứng đính kèm." },
  { level: 2, path: "factory", title: "Thăm nhà máy", short: "Nhà máy", description: "Ghi nhận kiểm tra tại cơ sở, địa chỉ, GPS, hình ảnh và video." },
  { level: 3, path: "deliveries", title: "Lịch sử giao hàng", short: "Giao hàng", description: "Đối chiếu một lô hàng đã giao bằng vận đơn và xác nhận giao nhận; RFQ thắng không đủ làm bằng chứng." },
] as const;

export function auditStep(level: number) { return AUDIT_STEPS.find((s) => s.level === level); }
export function auditItems(level: VerificationLevel) {
  return level === 1 ? L1_DOC_ITEMS : level === 2 ? L2_VISIT_ITEMS : DELIVERY_ITEMS;
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
