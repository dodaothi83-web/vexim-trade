/**
 * Chuỗi khung cổng nhà cung cấp: menu trái, thanh trên và các nhãn dùng ở layout.
 *
 * `en` là bản gốc; `vi` được khai báo theo kiểu suy ra từ nó nên thiếu khoá là lỗi biên dịch.
 */
const en = {
  brand: "VEXIM TRADE",
  portalName: "Supplier portal",
  nav: {
    overview: "Overview",
    storefront: "My page",
    products: "Products",
    categories: "Business categories",
    traffic: "Storefront visits",
    rfqs: "RFQs and quotes",
    messages: "Messages",
    documents: "Business verification and certificates",
    factory: "L2 factory verification",
    factoryPartner: "L2 partner factory",
    exportHistory: "L3 export history",
    profile: "Company profile",
  },
  groups: {
    shop: "STOREFRONT",
    work: "WORK",
    verify: "VERIFICATION",
    account: "ACCOUNT",
  },
  sidebar: {
    openMenu: "Open menu",
    closeMenu: "Close menu",
    viewPublicPage: "View public page",
    portalOpen: "PORTAL OPEN",
    awaitingReview: "AWAITING REVIEW",
    signOut: "Sign out",
  },
  topbar: {
    language: "Language",
    notifications: "Notifications",
    notificationsUnread: "Notifications, {count} unread",
    loading: "Loading",
    readsUnknown: "Read receipts unavailable",
    rfqsUnknown: "Quote requests could not be loaded",
    unreadCount: "{count} unread",
    allRead: "All read",
    saving: "Saving",
    markAllRead: "Mark all read",
    markRead: "Mark as read",
    empty: "No notifications yet.",
    loadingNotifications: "Loading notifications.",
    footerHint: "Pick a title to open the page that needs action.",
  },
  layout: {
    noCompany: "No company profile yet",
  },
} as const;

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type ShellMessages = DeepStrings<typeof en>;

const vi: ShellMessages = {
  brand: "VEXIM TRADE",
  portalName: "Cổng nhà cung cấp",
  nav: {
    overview: "Tổng quan",
    storefront: "Trang của tôi",
    products: "Sản phẩm",
    categories: "Danh mục kinh doanh",
    traffic: "Lượt xem gian hàng",
    rfqs: "RFQ & báo giá",
    messages: "Tin nhắn",
    documents: "Xác thực doanh nghiệp & chứng nhận",
    factory: "Xác thực nhà máy L2",
    factoryPartner: "Nhà máy đối tác L2",
    exportHistory: "Lịch sử xuất khẩu L3",
    profile: "Hồ sơ doanh nghiệp",
  },
  groups: {
    shop: "GIAN HÀNG",
    work: "CÔNG VIỆC",
    verify: "XÁC MINH",
    account: "TÀI KHOẢN",
  },
  sidebar: {
    openMenu: "Mở menu",
    closeMenu: "Đóng menu",
    viewPublicPage: "Xem trang công khai",
    portalOpen: "CỔNG ĐÃ ĐƯỢC MỞ",
    awaitingReview: "ĐANG CHỜ XÁC NHẬN",
    signOut: "Đăng xuất",
  },
  topbar: {
    language: "Ngôn ngữ",
    notifications: "Thông báo",
    notificationsUnread: "Thông báo, {count} chưa đọc",
    loading: "Đang tải",
    readsUnknown: "Chưa đọc được dấu đã đọc",
    rfqsUnknown: "Chưa tải được yêu cầu báo giá",
    unreadCount: "{count} chưa đọc",
    allRead: "Đã đọc hết",
    saving: "Đang lưu",
    markAllRead: "Đã đọc hết",
    markRead: "Đánh dấu đã đọc",
    empty: "Chưa có thông báo nào.",
    loadingNotifications: "Đang tải thông báo.",
    footerHint: "Chọn tiêu đề để mở trang cần xử lý.",
  },
  layout: {
    noCompany: "Chưa có hồ sơ doanh nghiệp",
  },
};

export const shellMessages = { en, vi };
