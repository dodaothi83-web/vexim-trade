/**
 * Danh mục dịch vụ nhà cung cấp yêu cầu tư vấn trong cổng ("Dịch vụ Vexim").
 *
 * Mã trùng với form công khai /for-suppliers (trừ đăng ký miễn phí, vì nhà cung cấp đã ở
 * trong cổng) để email nội bộ và CRM gọi đúng tên dịch vụ ở cả hai nơi.
 *
 * Tệp không import gì để script kiểm tra nạp thẳng bằng Node.
 */
/** plan_upgrade: yêu cầu nâng gói Premium/Pro, gửi từ "Trang của tôi" hoặc trang Dịch vụ. */
export const SUPPLIER_SERVICE_KEYS = ["international_website", "featured_ads", "fda_compliance", "plan_upgrade"] as const;
export type SupplierServiceKeyValue = (typeof SUPPLIER_SERVICE_KEYS)[number];

/**
 * Bốn trạng thái: Mới → Đã mở hoặc Đã huỷ → Hết hạn.
 * Với nâng gói, "Đã mở" do kích hoạt gói đặt và "Hết hạn" do tác vụ hằng ngày đặt; nhân viên chỉ chọn Mới / Đã huỷ.
 */
export const SUPPLIER_SERVICE_STATUSES = ["submitted", "active", "cancelled", "expired"] as const;
export type SupplierServiceStatusValue = (typeof SUPPLIER_SERVICE_STATUSES)[number];

export const SUPPLIER_SERVICE_NOTE_MAX = 1200;

export function isSupplierServiceKey(value: unknown): value is SupplierServiceKeyValue {
  return typeof value === "string" && (SUPPLIER_SERVICE_KEYS as readonly string[]).includes(value);
}

export function isSupplierServiceStatus(value: unknown): value is SupplierServiceStatusValue {
  return typeof value === "string" && (SUPPLIER_SERVICE_STATUSES as readonly string[]).includes(value);
}

/** Trạng thái nhân viên được tự chọn. Nâng gói không cho chọn tay "Đã mở"/"Hết hạn" để nhãn luôn khớp gói thật. */
export function manualServiceStatuses(key: string): readonly SupplierServiceStatusValue[] {
  return key === "plan_upgrade" ? ["submitted", "cancelled"] : SUPPLIER_SERVICE_STATUSES;
}

/** Yêu cầu còn "Mới" thì nhà cung cấp không gửi thêm cho cùng dịch vụ. */
export function hasOpenServiceRequest(
  requests: ReadonlyArray<{ service_key: string; status: string }>,
  key: string,
): boolean {
  return requests.some((request) => request.service_key === key && request.status === "submitted");
}

/** Đoán gói xin nâng từ ghi chú "Nâng lên gói …" mà form gửi kèm; không đoán được thì null. */
export function requestedPlanOf(note: string | null | undefined): "premium" | "pro" | null {
  if (!note) return null;
  if (/premium/i.test(note)) return "premium";
  if (/\bpro\b/i.test(note)) return "pro";
  return null;
}

/** Ghi chú "Gia hạn gói …" (gửi từ nút gia hạn) thay vì nâng lên gói cao hơn. */
export function isRenewalNote(note: string | null | undefined): boolean {
  return !!note && /gia hạn|renew/i.test(note);
}

/** Nhãn tiếng Việt cho CRM. */
export const SUPPLIER_SERVICE_LABELS_VI: Record<SupplierServiceKeyValue, string> = {
  international_website: "Website xuất khẩu",
  featured_ads: "Quảng cáo nổi bật",
  fda_compliance: "Tuân thủ FDA Hoa Kỳ",
  plan_upgrade: "Nâng gói Premium/Pro",
};

export const SUPPLIER_SERVICE_STATUS_LABELS_VI: Record<SupplierServiceStatusValue, string> = {
  submitted: "Mới",
  active: "Đã mở",
  cancelled: "Đã huỷ",
  expired: "Hết hạn",
};
