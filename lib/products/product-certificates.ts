/**
 * Chứng nhận theo từng sản phẩm — Phase 2, dùng lại cột đã có.
 *
 * Không có bảng mới: `certificates.requested_product_ids` (nhà cung cấp xin gắn) và
 * `certificates.approved_product_ids` (Vexim duyệt gắn). Nhờ vậy không cần migration
 * và dữ liệu chứng nhận vẫn là hồ sơ Giấy tờ L1 đã quét — không mở lại ô tự khai.
 *
 * Module thuần: không đọc CSDL, để server action, form và script kiểm tra dùng chung.
 */

export type ProductCertificateState = "approved" | "requested" | "none";

/** Phần của `Certificate` mà phần liên kết sản phẩm cần. */
export interface LinkableCertificate {
  id: string;
  name: string;
  issuer?: string | null;
  number?: string | null;
  valid_until?: string | null;
  requested_product_ids?: string[] | null;
  approved_product_ids?: string[] | null;
}

function ids(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((id) => typeof id === "string" && id) : [];
}

export function certificateProductState(certificate: LinkableCertificate, productId: string): ProductCertificateState {
  if (ids(certificate.approved_product_ids).includes(productId)) return "approved";
  if (ids(certificate.requested_product_ids).includes(productId)) return "requested";
  return "none";
}

export function productCertificates<T extends LinkableCertificate>(
  certificates: T[],
  productId: string,
): { approved: T[]; requested: T[] } {
  const approved: T[] = [];
  const requested: T[] = [];
  for (const certificate of certificates) {
    const state = certificateProductState(certificate, productId);
    if (state === "approved") approved.push(certificate);
    else if (state === "requested") requested.push(certificate);
  }
  return { approved, requested };
}

/** Danh sách id sau khi bật/tắt yêu cầu gắn; không bao giờ đụng tới danh sách đã duyệt. */
export function withRequestedProduct(certificate: LinkableCertificate, productId: string, on: boolean): string[] {
  const current = ids(certificate.requested_product_ids).filter((id) => id !== productId);
  return on ? [...current, productId] : current;
}

/** Danh sách id sau khi nhân viên duyệt/bỏ duyệt; bỏ duyệt cũng rút yêu cầu. */
export function withApprovedProduct(certificate: LinkableCertificate, productId: string, on: boolean): {
  approved_product_ids: string[];
  requested_product_ids: string[];
} {
  const approved = ids(certificate.approved_product_ids).filter((id) => id !== productId);
  const requested = ids(certificate.requested_product_ids).filter((id) => id !== productId);
  return {
    approved_product_ids: on ? [...approved, productId] : approved,
    requested_product_ids: requested,
  };
}

/** Nhãn một dòng cho danh sách chọn và cho trang sản phẩm. */
export function certificateLabel(certificate: LinkableCertificate): string {
  const name = certificate.name?.trim() || "Chứng nhận";
  const issuer = certificate.issuer?.trim();
  const valid = certificate.valid_until ? formatDate(certificate.valid_until) : "";
  const parts = [name];
  if (issuer) parts.push(issuer);
  if (valid) parts.push(`hết hạn ${valid}`);
  return parts.join(" · ");
}

function formatDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(parsed));
}

/** Chỉ chứng nhận còn hạn mới được gắn vào sản phẩm. */
export function certificateLinkable(certificate: LinkableCertificate, today = new Date()): boolean {
  if (!certificate.valid_until) return true;
  const parsed = Date.parse(certificate.valid_until);
  if (!Number.isFinite(parsed)) return true;
  return parsed >= new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}
