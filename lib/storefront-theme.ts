/**
 * Giao diện trang nhà cung cấp gói Premium/Pro.
 *
 * Một kiểu đầu trang chung (chủ sàn chốt 2026-11-20, bỏ 3 mẫu Thanh lịch / Hiện đại / Trưng bày
 * từng duyệt ngày 2026-11-15) và 4 tông màu chỉ dùng cho trang Premium/Pro: champagne,
 * terracotta, graphite, steel. Không có xanh lá hay đỏ đô vì hai màu này mang nghĩa "đã xác
 * minh" trên khiên của Vexim. Bản mẫu: docs/storefront-designer/index.html.
 *
 * Câu giới thiệu viết bằng tiếng Anh, không có liên hệ, như mọi chữ trên trang công khai.
 *
 * Tệp chỉ import tệp thuần để script kiểm tra nạp thẳng bằng Node.
 */
import { looksVietnamese } from "./vietnamese-text.ts";

export const STOREFRONT_TONES = ["champagne", "terracotta", "graphite", "steel"] as const;
export type StorefrontTone = (typeof STOREFRONT_TONES)[number];

/** Màu nhấn, màu đậm và nền nhạt của từng tông; giữ khớp mẫu xem trước. */
export const STOREFRONT_TONE_COLORS: Record<StorefrontTone, { accent: string; dark: string; tint: string }> = {
  champagne: { accent: "#9C7A4B", dark: "#7A5E36", tint: "#F6F0E6" },
  terracotta: { accent: "#B5532E", dark: "#8E3F22", tint: "#FBEEE8" },
  graphite: { accent: "#33383D", dark: "#1F2326", tint: "#F1F2F3" },
  steel: { accent: "#2C5F7C", dark: "#1F4A62", tint: "#EAF2F6" },
};

/** Số liệu nhà cung cấp chọn hiện nổi bật (tối đa 4); giá trị lấy từ hồ sơ, không nhập tay. */
export const STOREFRONT_STATS = ["capacity", "founded", "employees", "markets", "lead_time", "moq", "incoterms"] as const;
export type StorefrontStat = (typeof STOREFRONT_STATS)[number];
export const STOREFRONT_MAX_STATS = 4;
export const STOREFRONT_TAGLINE_MAX = 160;

export interface StorefrontTheme {
  tone: StorefrontTone;
  tagline: string;
  stats: StorefrontStat[];
}

export const DEFAULT_STOREFRONT_THEME: StorefrontTheme = {
  tone: "champagne",
  tagline: "",
  stats: ["capacity", "founded", "markets", "lead_time"],
};

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** Đọc từ CSDL: giá trị lạ về mặc định, số liệu lọc trùng và giới hạn 4. */
export function normalizeStorefrontTheme(raw: unknown): StorefrontTheme {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const stats = Array.isArray(value.stats)
    ? [...new Set(value.stats.filter((item): item is StorefrontStat => isOneOf(STOREFRONT_STATS, item)))].slice(0, STOREFRONT_MAX_STATS)
    : DEFAULT_STOREFRONT_THEME.stats;
  return {
    tone: isOneOf(STOREFRONT_TONES, value.tone) ? value.tone : DEFAULT_STOREFRONT_THEME.tone,
    tagline: typeof value.tagline === "string" ? value.tagline.trim().slice(0, STOREFRONT_TAGLINE_MAX) : "",
    stats,
  };
}

export type ThemeInputProblem = "tone" | "stats" | "taglineTooLong" | "contact" | "language" | null;

const CONTACT = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|\b[\w-]+\.(?:com|vn|net|org|io|co)\b|(?:\+?\d[\s().-]?){9,15}\d/i;

/** Kiểm tra lựa chọn của nhà cung cấp trước khi lưu. */
export function storefrontThemeProblem(input: { tone: unknown; tagline: unknown; stats: unknown }): ThemeInputProblem {
  if (!isOneOf(STOREFRONT_TONES, input.tone)) return "tone";
  if (!Array.isArray(input.stats) || input.stats.length > STOREFRONT_MAX_STATS || !input.stats.every((item) => isOneOf(STOREFRONT_STATS, item))) return "stats";
  const tagline = typeof input.tagline === "string" ? input.tagline.trim() : "";
  if (tagline.length > STOREFRONT_TAGLINE_MAX) return "taglineTooLong";
  if (CONTACT.test(tagline)) return "contact";
  if (looksVietnamese(tagline)) return "language";
  return null;
}
