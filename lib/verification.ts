/**
 * Các tiện ích dùng cho quy trình xác minh (L1/L2/L3).
 * Tách riêng khỏi "use server" file vì Next.js chỉ cho phép export async server actions
 * từ những file có "use server" ở đầu.
 */

import { DELIVERY_ITEMS, L1_DOC_ITEMS, L2_PARTNER_REVIEW_ITEMS, L2_VISIT_ITEMS, type AuditEvidenceKey, type L2VerificationScope, type Verification, type VerificationLevel } from "./types";

export const AUDIT_STEPS = [
  { level: 1, path: "documents", title: "Kiểm tra giấy tờ", short: "Giấy tờ", description: "Đối chiếu giấy phép, chứng nhận và bằng chứng đính kèm." },
  { level: 2, path: "factory", title: "Xác thực nhà máy", short: "Nhà máy", description: "Đối chiếu theo danh mục 9 ảnh nhà máy (chuẩn chung với cổng NCC tự gửi); ghi nhận địa chỉ, GPS và hình ảnh thực tế." },
  { level: 3, path: "deliveries", title: "Lịch sử giao hàng", short: "Giao hàng", description: "Đối chiếu chứng từ phù hợp của một lô hàng; chứng từ xuất khẩu không mặc nhiên xác nhận buyer cuối đã nhận." },
] as const;

export function auditStep(level: number) { return AUDIT_STEPS.find((s) => s.level === level); }
export function auditItems(level: VerificationLevel, scope?: L2VerificationScope | null) {
  return level === 1 ? L1_DOC_ITEMS : level === 2 ? scope === "partner_contract" ? L2_PARTNER_REVIEW_ITEMS : L2_VISIT_ITEMS : DELIVERY_ITEMS;
}

/** Mục bắt buộc ghi nhận: ở L1 chỉ còn mã số thuế (ô số). Giấy xác minh chính dùng quy tắc một-trong-ba bên dưới. */
export function requiredAuditItems(level: VerificationLevel) {
  return level === 1 ? L1_DOC_ITEMS.filter((item) => item.required) : [];
}

/**
 * Ba giấy xác minh chính của bước giấy tờ. Nhà máy chỉ cần MỘT trong ba là đủ để xác minh,
 * nhưng giấy phải đứng tên pháp nhân đã đăng ký với Vexim; giấy của nhà máy đối tác chỉ là
 * thông tin tham khảo, không thay được giấy xác minh chính.
 */
export const L1_CORE_DOC_KEYS = ["business_license", "food_safety", "haccp_or_brc"] as const;

export function isL1CoreDoc(key: string | null | undefined): boolean {
  return !!key && (L1_CORE_DOC_KEYS as readonly string[]).includes(key);
}

/** True khi người kiểm đã đánh dấu Đạt ít nhất một trong ba giấy xác minh chính. */
export function coreDocsVerified(checklist: Verification["checklist"] | null | undefined): boolean {
  return L1_CORE_DOC_KEYS.some((key) => checklist?.[key] === true);
}

/** Which rows accept uploads; all other rows are notes/structured inputs. */
export function auditUploadKind(level: VerificationLevel, key: AuditEvidenceKey, scope?: L2VerificationScope | null): "image" | "file" | null {
  if (level === 1) return L1_DOC_ITEMS.some((item) => item.key === key) && !["tax_certificate", "bank_letter"].includes(key) ? "file" : null;
  if (level === 2) {
    if (scope === "partner_contract") return key === "partner_factory_contract" ? "file" : key === "partner_factory_photos" ? "image" : null;
    // Cả 9 dòng của danh mục mới đều là dòng ảnh (chuẩn chung với cổng NCC tự gửi).
    // Key cũ (photos_taken, documents_original…) không còn là dòng tải lên; dữ liệu cũ hiển thị read-only.
    return L2_VISIT_ITEMS.some((item) => item.key === key) ? "image" : null;
  }
  return ["shipping_proof", "delivery_proof"].includes(key) ? "file" : null;
}
export function auditHref(supplierId: string, level: number, reviewId?: string | null) {
  const step = auditStep(level);
  const base = step ? `/crm/suppliers/${encodeURIComponent(supplierId)}/audit/${step.path}` : `/crm/suppliers/${encodeURIComponent(supplierId)}`;
  return reviewId && step ? `${base}?review=${encodeURIComponent(reviewId)}` : base;
}

/** Ước chừng toạ độ Việt Nam để cảnh báo GPS sai khi xác thực nhà máy. */
export function inVnBounds(lat: number | null, lng: number | null): boolean | null {
  if (lat == null || lng == null) return null;
  return lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110;
}
