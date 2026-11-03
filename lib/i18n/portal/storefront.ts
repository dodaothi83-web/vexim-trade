/**
 * Chuỗi cụm 5d: trang "Trang của tôi" (bản xem trước hồ sơ công khai).
 *
 * Khung trang là tiếng Việt/tiếng Anh theo ngôn ngữ đang chọn, còn phần thân hồ sơ do
 * `SupplierStorefront` dựng và cố ý giữ nguyên như trang người mua thấy.
 */
const en = {
  metaTitle: "My page",
  eyebrow: "Supplier portal · private",
  title: "My page",
  sub: "Exactly what buyers see on your public profile.",
  checks: {
    documents: "Documents checked",
    factory: "Factory verification",
    delivery: "Delivery history",
    partnerContract: "Partner factory contract",
  },
  loadError: {
    title: "Could not build the preview",
    body: "Profile data could not be loaded. Your profile has not been changed. Reload the page; if it keeps failing, contact support.",
  },
  preview: {
    aria: "Preview status",
    lead: "Preview.",
    body: "This is exactly what buyers see on your public page. Only you can see this screen.",
    live: "Profile is live · Open public page",
    notPublished: "Not published yet · buyers cannot open this page",
    verification: "Verification: {count} of 3 checks approved",
    approved: "Approved: {list}",
    approvedNone: "none yet",
    notReviewed: "Not reviewed yet: {list}",
    allApproved: "none, all three checks are approved",
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type StorefrontMessages = DeepStrings<typeof en>;

const vi: StorefrontMessages = {
  metaTitle: "Trang của tôi",
  eyebrow: "Cổng nhà cung cấp · riêng tư",
  title: "Trang của tôi",
  sub: "Đúng nội dung người mua nhìn thấy trên hồ sơ công khai.",
  checks: {
    documents: "Giấy tờ đã kiểm tra",
    factory: "Xác minh nhà máy",
    delivery: "Lịch sử giao hàng",
    partnerContract: "Hợp đồng nhà máy đối tác",
  },
  loadError: {
    title: "Chưa dựng được bản xem trước",
    body: "Chưa đọc được dữ liệu hồ sơ. Hồ sơ của bạn không bị thay đổi. Thử tải lại trang; nếu vẫn lỗi, liên hệ bộ phận hỗ trợ.",
  },
  preview: {
    aria: "Trạng thái bản xem trước",
    lead: "Xem trước.",
    body: "Đây đúng là nội dung người mua thấy trên trang công khai của bạn. Chỉ bạn thấy màn hình này.",
    live: "Hồ sơ đang công khai · Mở trang công khai",
    notPublished: "Chưa công khai · người mua chưa mở được trang này",
    verification: "Xác minh: {count}/3 bước đã duyệt",
    approved: "Đã duyệt: {list}",
    approvedNone: "chưa có bước nào",
    notReviewed: "Chưa xét: {list}",
    allApproved: "không còn bước nào, cả ba bước đã duyệt",
  },
};

export const storefrontMessages = { en, vi };
