import type { AppUserRecord, AuditEvidenceKey, Verification } from "@/lib/types";
import { auditUploadKind } from "@/lib/verification";

/** Supplier accounts never inherit staff permissions, even if they know another supplier's ID. */
export function ownsDocumentReview(user: Pick<AppUserRecord, "role" | "is_active" | "supplier_id"> | null, review: Pick<Verification, "supplier_id" | "target_level" | "status"> | null): boolean {
  return !!user?.is_active && user.role === "supplier" && !!user.supplier_id &&
    !!review && review.target_level === 1 && user.supplier_id === review.supplier_id;
}

export function canUploadOwnDocument(user: Pick<AppUserRecord, "role" | "is_active" | "supplier_id"> | null, review: Verification | null, key: string): boolean {
  return ownsDocumentReview(user, review) && !!review &&
    (review.status === "in_progress" || review.status === "returned") &&
    auditUploadKind(1, key as AuditEvidenceKey) === "file";
}

/**
 * Giấy tờ bước 1 mà nhà cung cấp tải trong lưới thẻ. Hai mục chứng nhận chất lượng
 * (`haccp_or_brc`, `product_certs`) đã chuyển sang kho chứng nhận ở khối "Chứng nhận trên
 * hồ sơ": một ô tải duy nhất, không chọn ngăn, tệp vào đúng bản ghi chứng nhận để có hạn
 * nhắc, badge và phạm vi sản phẩm. Giữ key trong luồng cũ để đọc được tệp đã tải trước đây.
 */
export const QUALITY_CERTIFICATE_DOC_KEYS = ["haccp_or_brc", "product_certs"] as const;

export const INITIAL_DOCUMENT_KEYS = ["business_license", "food_safety", "haccp_or_brc", "product_certs", "export_license"] as const;

/** Ba giấy tờ doanh nghiệp còn ô tải riêng trong lưới (pháp lý, không phải chứng nhận chất lượng). */
export const COMPANY_DOCUMENT_KEYS = INITIAL_DOCUMENT_KEYS.filter(
  (key) => !(QUALITY_CERTIFICATE_DOC_KEYS as readonly string[]).includes(key),
);
