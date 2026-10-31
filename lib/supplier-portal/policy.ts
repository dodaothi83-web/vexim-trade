import type { AppUserRecord, AuditEvidenceKey, Verification } from "@/lib/types";
import { auditUploadKind } from "@/lib/verification";

/** Supplier accounts never inherit staff permissions, even if they know another supplier's ID. */
export function ownsDocumentReview(user: Pick<AppUserRecord, "role" | "is_active" | "supplier_id"> | null, review: Pick<Verification, "supplier_id" | "target_level" | "status"> | null): boolean {
  return !!user?.is_active && user.role === "supplier" && !!user.supplier_id &&
    !!review && review.target_level === 1 && user.supplier_id === review.supplier_id;
}

export function canUploadOwnDocument(
  user: Pick<AppUserRecord, "role" | "is_active" | "supplier_id"> | null,
  review: Verification | null,
  key: string,
  options?: { hasFile?: boolean },
): boolean {
  if (!ownsDocumentReview(user, review) || !review) return false;
  if (auditUploadKind(1, key as AuditEvidenceKey) !== "file") return false;
  if (review.status === "in_progress" || review.status === "returned") return true;
  /*
   * Giấy chứng nhận đăng ký kinh doanh là giấy duy nhất của bước xác thực doanh nghiệp, và
   * nhân viên không mở lại được đợt đã duyệt. Vì vậy đợt đã duyệt vẫn nhận **bản bổ sung**
   * khi mục đó còn trống: không đổi kết quả xác thực, không mở lại đợt, nhân viên nhận mail
   * như mọi lần tải. Đã có tệp rồi thì không cho thay để không đổi giấy sau khi duyệt.
   */
  return review.status === "approved" && key === "business_license" && !options?.hasFile;
}

/**
 * Giấy tờ bước 1 mà nhà cung cấp tải trong lưới thẻ. Hai mục chứng nhận chất lượng
 * (`haccp_or_brc`, `product_certs`) đã chuyển sang kho chứng nhận ở khối "Chứng nhận trên
 * hồ sơ": một ô tải duy nhất, không chọn ngăn, tệp vào đúng bản ghi chứng nhận để có hạn
 * nhắc, badge và phạm vi sản phẩm. Giữ key trong luồng cũ để đọc được tệp đã tải trước đây.
 */
export const QUALITY_CERTIFICATE_DOC_KEYS = ["haccp_or_brc", "product_certs"] as const;

export const INITIAL_DOCUMENT_KEYS = ["business_license", "food_safety", "haccp_or_brc", "product_certs", "export_license"] as const;

/**
 * Giấy xác thực doanh nghiệp còn ô tải riêng: đúng **một** giấy là Giấy chứng nhận đăng ký
 * kinh doanh. Giấy ATTP và giấy phép xuất khẩu không còn ô riêng; chứng nhận chất lượng
 * (HACCP, ISO, BRC, Halal…) đi qua kho chứng nhận — một đường vào duy nhất, không phải tải
 * hai lần ở hai chỗ. Key cũ vẫn nằm trong `INITIAL_DOCUMENT_KEYS` để đọc tệp đã tải trước đây.
 */
export const COMPANY_DOCUMENT_KEYS = ["business_license"] as const;
