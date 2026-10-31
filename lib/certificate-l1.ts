/**
 * Bảng giấy tờ L1 suy ra từ chính giấy đã được duyệt.
 *
 * Nhà cung cấp chỉ tải giấy lên kho "Giấy tờ & chứng nhận"; nhân viên phân loại (loại
 * giấy, đơn vị đứng tên, hạn, công khai/nội bộ, phạm vi). Ô checklist L1 không còn là
 * thứ nhà cung cấp tự chọn, nên bảng L1 được tính lại từ giấy đã duyệt:
 * `checklistKeyForScheme` nói giấy đó đóng góp mục nào.
 *
 * Mục nào không có giấy tương ứng thì để trống — bảng chỉ hiển thị, không tự đánh dấu
 * "đạt": kết quả L1 vẫn do người có quyền duyệt quyết định.
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

/** Mục checklist mà giấy này đóng góp theo loại đã chọn (null = không đóng góp mục nào). */
export function contributedChecklistKey(certificate: L1CertificateLike): string | null {
  const scheme = isCertificateScheme(certificate.certificate_scheme) ? certificate.certificate_scheme : null;
  return checklistKeyForScheme(scheme) ?? certificate.checklist_key ?? null;
}

/**
 * Cảnh báo khi loại giấy nhân viên chọn lệch mục checklist đã ghi trên hồ sơ.
 *
 * Ví dụ: giấy được ghi vào mục "HACCP/ISO/FSSC/BRC/Halal" nhưng loại chọn lại là
 * "Giấy phép xuất khẩu". Câu này chỉ để nhân viên soát lại, không tự sửa dữ liệu.
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
