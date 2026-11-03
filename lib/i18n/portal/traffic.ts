/**
 * Chuỗi cụm 5c: trang "Lượt xem gian hàng" trong cổng nhà cung cấp.
 *
 * Số liệu do `lib/supplier-portal/traffic-report.ts` trả về là số thuần, không chứa câu chữ;
 * mọi câu ở đây chỉ mô tả cách tính để nhà cung cấp không đọc thành số người mua duy nhất.
 */
const en = {
  metaTitle: "Storefront views",
  eyebrow: "Supplier portal · private",
  title: "Storefront views",
  sub: "Track how often buyers open your public profile and product detail pages.",
  viewPublic: "View public profile",
  rangeAria: "Time range",
  days: "{count} days",
  noData: {
    title: "No tracking data yet",
    body: "The report cannot reach the statistics table. Engineering needs to enable tracking on the right project. With no data we show nothing rather than a zero.",
  },
  kpi: {
    total: "Total views",
    profile: "Supplier profile",
    product: "Product detail",
  },
  empty: {
    title: "No views in the last {days} days",
    body: "Numbers start from the day tracking was turned on. Your profile and products must be public for views to be recorded.",
  },
  trend: {
    title: "View trend",
    sub: "By UTC day · each column is {span}",
    oneDay: "1 day",
    manyDays: "{count} days",
    legendProfile: "Profile",
    legendProduct: "Products",
    chartAria: "{days}-day chart: {profile} profile views, {product} product views",
    barTitle: "{label}: {profile} profile, {product} products",
    range: "{from} to {to}",
    details: "See the numbers for each point",
    colTime: "Period (UTC)",
    colProfile: "Profile",
    colProduct: "Products",
    foot: "Page views, not unique people. Columns are grouped by the range you picked.",
  },
  top: {
    title: "Most viewed products",
    sub: "In the last {days} days · your products only",
    removed: "Product removed",
    empty: "No product views yet. Profile views are counted separately.",
  },
  note: {
    title: "How we count.",
    items: [
      "Only public profile and product pages opened in a browser are counted; signed-in sessions, demo data and common crawlers are skipped.",
      "The same page in one tab counts once every 30 minutes. No IP, viewer identity or referrer is stored.",
      "Numbers can miss hits from blocked JavaScript or bots, and do not represent unique buyers.",
      "Views from before tracking was turned on are not included.",
    ],
  },
};

type DeepStrings<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepStrings<T[K]>;
};

export type TrafficMessages = DeepStrings<typeof en>;

const vi: TrafficMessages = {
  metaTitle: "Lượt xem gian hàng",
  eyebrow: "Cổng nhà cung cấp · riêng tư",
  title: "Lượt xem gian hàng",
  sub: "Theo dõi số lần người mua mở hồ sơ và trang chi tiết sản phẩm công khai của bạn.",
  viewPublic: "Xem hồ sơ công khai",
  rangeAria: "Khoảng thời gian",
  days: "{count} ngày",
  noData: {
    title: "Chưa có dữ liệu theo dõi",
    body: "Báo cáo chưa kết nối được bảng thống kê. Kỹ thuật cần bật theo dõi trên đúng dự án. Chưa có dữ liệu thì không hiện số 0.",
  },
  kpi: {
    total: "Tổng lượt xem",
    profile: "Hồ sơ nhà cung cấp",
    product: "Chi tiết sản phẩm",
  },
  empty: {
    title: "Chưa có lượt xem trong {days} ngày qua",
    body: "Số liệu chỉ bắt đầu từ khi bật theo dõi. Hồ sơ và sản phẩm cần được công khai để có lượt xem được ghi nhận.",
  },
  trend: {
    title: "Xu hướng lượt xem",
    sub: "Theo ngày UTC · mỗi cột {span}",
    oneDay: "1 ngày",
    manyDays: "{count} ngày",
    legendProfile: "Hồ sơ",
    legendProduct: "Sản phẩm",
    chartAria: "Biểu đồ {days} ngày: {profile} lượt hồ sơ, {product} lượt sản phẩm",
    barTitle: "{label}: {profile} hồ sơ, {product} sản phẩm",
    range: "{from} đến {to}",
    details: "Xem số liệu từng mốc",
    colTime: "Thời gian (UTC)",
    colProfile: "Hồ sơ",
    colProduct: "Sản phẩm",
    foot: "Lượt xem trang, không phải số người duy nhất. Cột gộp theo thời gian đã chọn.",
  },
  top: {
    title: "Sản phẩm được xem nhiều",
    sub: "Trong {days} ngày qua · chỉ sản phẩm của bạn",
    removed: "Sản phẩm đã gỡ",
    empty: "Chưa có lượt xem sản phẩm. Lượt xem hồ sơ được thống kê riêng.",
  },
  note: {
    title: "Cách tính minh bạch.",
    items: [
      "Chỉ ghi nhận trang hồ sơ/sản phẩm công khai mở bằng trình duyệt; bỏ qua phiên đăng nhập, demo và crawler thông dụng.",
      "Cùng trang trong một tab được tính một lần mỗi 30 phút. Không lưu IP, danh tính người xem hay nguồn truy cập.",
      "Số liệu có thể thiếu do chặn JavaScript hoặc bot, và không đại diện cho người mua duy nhất.",
      "Không bao gồm lượt xem trước ngày bật theo dõi.",
    ],
  },
};

export const trafficMessages = { en, vi };
