/**
 * Chứng nhận đã được nhân viên duyệt gắn cho MỘT sản phẩm cụ thể.
 *
 * Trang sản phẩm chỉ được hiển thị tập con của những chứng nhận đã đủ điều kiện
 * công khai trên hồ sơ nhà cung cấp (`publicSupplierCertificates`). Nghĩa là:
 * gắn sản phẩm KHÔNG mở thêm cổng công bố nào, và chứng nhận chưa duyệt, đã hết
 * hạn hoặc bị nhân viên ẩn không bao giờ lọt ra chỉ vì có trong danh sách gắn.
 *
 * Module thuần, không import gì, để script kiểm tra nạp thẳng bằng node.
 */

export interface ProductCertificateLinkRow {
  id: string;
  supplier_id?: string | null;
  approved_product_ids?: unknown;
}

/**
 * Id những chứng nhận mà nhân viên đã duyệt gắn cho `productId`
 * (`approved_product_ids`, không phải `requested_product_ids` của nhà cung cấp).
 * Chỉ nhận chứng nhận thuộc đúng nhà cung cấp của sản phẩm.
 */
export function approvedProductCertificateIds(
  certificates: readonly ProductCertificateLinkRow[],
  supplierId: string,
  productId: string,
): Set<string> {
  const ids = new Set<string>();
  if (!supplierId || !productId) return ids;
  for (const certificate of certificates) {
    if (!certificate || certificate.supplier_id !== supplierId) continue;
    const approved = certificate.approved_product_ids;
    if (!Array.isArray(approved)) continue;
    if (!approved.some((value) => value === productId)) continue;
    ids.add(certificate.id);
  }
  return ids;
}
