/**
 * Bảng phân loại các chứng nhận đã được duyệt.
 *
 * Nhân viên phân loại chứng nhận trong kho riêng (loại giấy, đơn vị đứng tên, hạn,
 * công khai/nội bộ, phạm vi). Khóa nhóm lịch sử từ `checklistKeyForScheme` chỉ dùng
 * để trình bày bảng; không ghi vào checklist xác thực GCN ĐKKD và không quyết định
 * kết quả duyệt doanh nghiệp.
 *
 * Mục nào không có chứng nhận tương ứng thì để trống — bảng chỉ hiển thị tình trạng
 * chứng nhận, không tự đánh dấu Đạt hoặc xác minh doanh nghiệp.
 *
 * Module thuần, không import gì ngoài module thuần khác.
 */

import { checklistKeyForScheme, isCertificateScheme, type CertificateScheme } from "./certificate-scheme";

export interface L1CertificateLike {
  id: string;
  name: string;
  valid_until?: string | null;
  checklist_key?: string | null;
  certificate_scheme?: CertificateScheme | string | null;
  review_status?: string | null;
  publicly_visible?: boolean | null;
  staff_hidden?: boolean | null;
}

export interface L1DerivedEntry {
  id: string;
  name: string;
  scheme: CertificateScheme | null;
  validUntil: string | null;
  expired: boolean;
}

export interface L1DerivedRow {
  key: string;
  certificates: L1DerivedEntry[];
}

/** Giấy đã duyệt và còn hạn, gom theo mục checklist L1 mà nó đóng góp. */
export function deriveL1Rows(
  certificates: readonly L1CertificateLike[],
  today = new Date().toISOString().slice(0, 10),
): L1DerivedRow[] {
  const rows = new Map<string, L1DerivedEntry[]>();
  for (const certificate of certificates) {
    if (certificate.review_status !== "approved") continue;
    if (certificate.staff_hidden) continue;
    const scheme = isCertificateScheme(certificate.certificate_scheme) ? certificate.certificate_scheme : null;
    const key = checklistKeyForScheme(scheme) ?? certificate.checklist_key ?? null;
    if (!key) continue;
    const list = rows.get(key) ?? [];
    list.push({
      id: certificate.id,
      name: certificate.name,
      scheme,
      validUntil: certificate.valid_until ?? null,
      expired: Boolean(certificate.valid_until && certificate.valid_until < today),
    });
    rows.set(key, list);
  }
  return [...rows.entries()].map(([key, certificates]) => ({ key, certificates }));
}

/** Khóa nhóm lịch sử dùng trong bảng chứng nhận (null = không gắn nhóm cũ). */
export function contributedChecklistKey(certificate: L1CertificateLike): string | null {
  const scheme = isCertificateScheme(certificate.certificate_scheme) ? certificate.certificate_scheme : null;
  return checklistKeyForScheme(scheme) ?? certificate.checklist_key ?? null;
}

/**
 * Cảnh báo dữ liệu liên kết lịch sử không khớp với loại chứng nhận đã chọn.
 *
 * Cảnh báo chỉ phục vụ rà soát metadata trong kho chứng nhận; không quyết định hoặc
 * sửa kết quả xác thực doanh nghiệp.
 */
export function checklistMismatch(certificate: L1CertificateLike): string | null {
  const recorded = (certificate.checklist_key ?? "").trim();
  if (!recorded) return null;
  const expected = checklistKeyForScheme(
    isCertificateScheme(certificate.certificate_scheme) ? certificate.certificate_scheme : null,
  );
  if (!expected || expected === recorded) return null;
  return `Mục checklist đang ghi “${recorded}” nhưng loại giấy này thuộc “${expected}”.`;
}
