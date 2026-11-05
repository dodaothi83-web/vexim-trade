/**
 * Điều kiện xác minh để nhà cung cấp được mua gói đẩy sản phẩm.
 *
 * Vùng đẩy nằm ở đầu trang danh mục, chỗ người mua nhìn đầu tiên, nên không được là
 * nhà cung cấp mới chỉ qua một bước. Cần L1 (xác thực doanh nghiệp) và thêm ít nhất
 * một trong L2 (nhà máy hoặc hợp đồng nhà máy đối tác) hay L3 (lịch sử giao hàng).
 * L1 là bắt buộc: các bước được đếm độc lập, nên L2 + L3 mà thiếu L1 vẫn là 2/3, và
 * quảng cáo cho doanh nghiệp chưa xác thực pháp lý là rủi ro lớn nhất.
 *
 * Chứng nhận hết hạn không làm mất quyền mua (chỉ trừ điểm xếp hạng). Trả tiền không
 * mua được quyền vượt cổng này. Hàm thuần, không đọc dữ liệu.
 */
export type SponsoredVerificationGate = "ok" | "needs_l1" | "needs_l2_or_l3";

export function sponsoredVerificationGate(approvedSteps: readonly number[]): SponsoredVerificationGate {
  if (!approvedSteps.includes(1)) return "needs_l1";
  if (!approvedSteps.includes(2) && !approvedSteps.includes(3)) return "needs_l2_or_l3";
  return "ok";
}

export function sponsoredVerificationEligible(approvedSteps: readonly number[]): boolean {
  return sponsoredVerificationGate(approvedSteps) === "ok";
}
