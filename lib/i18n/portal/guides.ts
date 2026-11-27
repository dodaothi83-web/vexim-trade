/**
 * Chuỗi trang "Hướng dẫn" trong cổng nhà cung cấp (giai đoạn 1, 27/11/2026).
 * Nội dung bài do Vexim soạn bằng tiếng Việt; phần khung trang theo ngôn ngữ cổng.
 */
const en = {
  metaTitle: "Guides",
  eyebrow: "Supplier portal",
  title: "Guides",
  sub: "Short step-by-step guides from Vexim for using the supplier portal.",
  empty: { title: "No guides yet", body: "Vexim is preparing the first guides. Check back soon." },
  unavailable: "Guides cannot be loaded right now. Please try again later.",
  minutes: "{count} min read",
  steps: "{count} steps",
  back: "All guides",
  vietnameseOnly: "This guide is written in Vietnamese.",
  vietnameseOnlyList: "Guides are written in Vietnamese.",
  updated: "Updated {date}",
  moreInTopic: "More in this topic",
  help: "Still stuck? Contact Vexim and we will help you.",
  hero: {
    label: "Vexim guide centre",
    title: "Sell to international buyers on Vexim",
    lede: "Step-by-step guides, from your company profile to answering your first quote request.",
    searchLabel: "Search guides",
    searchPlaceholder: "Search guides, e.g. post a product",
    searchButton: "Search",
  },
  path: { title: "Path for new suppliers", sub: "Follow these five stages in order.", stage: "Stage {n}", count: "{count} guides", soon: "Coming soon" },
  library: { title: "Guide library", all: "All guides", topicsAria: "Guide topics" },
  results: { title: "Results for '{q}'", none: "No guide matches '{q}'. Try a shorter word.", clear: "Clear search" },
};

type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type GuidesMessages = DeepStrings<typeof en>;

const vi: GuidesMessages = {
  metaTitle: "Hướng dẫn",
  eyebrow: "Cổng nhà cung cấp",
  title: "Hướng dẫn",
  sub: "Các bài hướng dẫn ngắn, từng bước, giúp bạn dùng cổng nhà cung cấp.",
  empty: { title: "Chưa có bài hướng dẫn", body: "Vexim đang soạn những bài đầu tiên. Bạn quay lại sau nhé." },
  unavailable: "Chưa tải được bài hướng dẫn. Bạn thử lại sau ít phút.",
  minutes: "{count} phút đọc",
  steps: "{count} bước",
  back: "Tất cả hướng dẫn",
  vietnameseOnly: "Bài hướng dẫn viết bằng tiếng Việt.",
  vietnameseOnlyList: "Các bài hướng dẫn viết bằng tiếng Việt.",
  updated: "Cập nhật {date}",
  moreInTopic: "Bài khác cùng chủ đề",
  help: "Vẫn chưa làm được? Liên hệ Vexim, Vexim sẽ hỗ trợ bạn.",
  hero: {
    label: "Trung tâm hướng dẫn Vexim",
    title: "Bán hàng cho người mua quốc tế trên Vexim",
    lede: "Hướng dẫn từng bước, từ điền hồ sơ doanh nghiệp tới trả lời yêu cầu báo giá đầu tiên.",
    searchLabel: "Tìm bài hướng dẫn",
    searchPlaceholder: "Tìm bài hướng dẫn, ví dụ: đăng sản phẩm",
    searchButton: "Tìm",
  },
  path: { title: "Lộ trình cho nhà cung cấp mới", sub: "Làm lần lượt năm chặng dưới đây.", stage: "Chặng {n}", count: "{count} bài", soon: "Sắp có" },
  library: { title: "Thư viện hướng dẫn", all: "Tất cả", topicsAria: "Chủ đề hướng dẫn" },
  results: { title: "Kết quả cho '{q}'", none: "Không có bài nào khớp '{q}'. Thử từ ngắn hơn.", clear: "Xoá tìm kiếm" },
};

export const guidesMessages = { en, vi };
