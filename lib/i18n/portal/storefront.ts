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
  loadError: {
    title: "Could not build the preview",
    body: "Profile data could not be loaded. Your profile has not been changed. Reload the page; if it keeps failing, contact support.",
  },
  owner: {
    planBadge: "{plan} plan",
    validUntil: "Valid until {date}",
    viewPage: "View page",
    notPublished: "Not published yet",
    notPublishedHint: "Buyers cannot open this page until Vexim publishes your profile.",
    upgrade: "Upgrade plan",
    viewPlans: "View plans",
    plansTitle: "Supplier plans",
    plansSub: "Choose a plan and send a request; Vexim contacts you to confirm. Nothing is charged here.",
    current: "Current plan",
    close: "Close",
    request: "Request {plan}",
    requestNote: "Upgrade to the {plan} plan",
    requestOpen: "Your upgrade request is being handled. Vexim will contact you.",
    renew: "Renew {plan}",
    renewNote: "Renew the {plan} plan",
    contactLine: "Vexim will contact {email}.",
    free: "Free",
    months: "{months} months",
    avatarAdd: "Add profile photo",
    avatarChange: "Change profile photo",
    avatarHint: "Square image, at least 400 × 400 px",
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
  loadError: {
    title: "Chưa dựng được bản xem trước",
    body: "Chưa đọc được dữ liệu hồ sơ. Hồ sơ của bạn không bị thay đổi. Thử tải lại trang; nếu vẫn lỗi, liên hệ bộ phận hỗ trợ.",
  },
  owner: {
    planBadge: "Gói {plan}",
    validUntil: "Hiệu lực đến {date}",
    viewPage: "Xem trang",
    notPublished: "Chưa công khai",
    notPublishedHint: "Người mua chưa mở được trang này cho tới khi Vexim công khai hồ sơ.",
    upgrade: "Nâng cấp gói",
    viewPlans: "Xem các gói",
    plansTitle: "Các gói nhà cung cấp",
    plansSub: "Chọn gói và gửi yêu cầu, Vexim sẽ liên hệ để xác nhận. Không thu phí tại đây.",
    current: "Gói hiện tại",
    close: "Đóng",
    request: "Yêu cầu gói {plan}",
    requestNote: "Nâng lên gói {plan}",
    requestOpen: "Yêu cầu nâng gói đang được xử lý. Vexim sẽ liên hệ với bạn.",
    renew: "Gia hạn {plan}",
    renewNote: "Gia hạn gói {plan}",
    contactLine: "Vexim sẽ liên hệ qua {email}.",
    free: "Miễn phí",
    months: "{months} tháng",
    avatarAdd: "Thêm ảnh đại diện",
    avatarChange: "Đổi ảnh đại diện",
    avatarHint: "Ảnh vuông, tối thiểu 400 × 400 px",
  },
};

export const storefrontMessages = { en, vi };
