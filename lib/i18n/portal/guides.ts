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
};

export const guidesMessages = { en, vi };
