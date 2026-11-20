/**
 * Giao diện trang nhà cung cấp gói Premium/Pro (chủ sàn duyệt ngày 2026-11-15).
 *
 * 3 mẫu: Thanh lịch (elegant), Hiện đại (modern), Trưng bày (gallery). 4 tông màu chỉ dùng
 * cho trang nhà cung cấp Premium/Pro: champagne, terracotta, graphite, steel. Không có xanh
 * lá hay đỏ đô vì hai màu này mang nghĩa "đã xác minh" trên khiên của Vexim.
 * Mẫu xem trước: docs/storefront-templates/index.html.
 *
 * Câu giới thiệu viết bằng tiếng Anh, không có liên hệ, như mọi chữ trên trang công khai.
 *
 * Tệp chỉ import tệp thuần để script kiểm tra nạp thẳng bằng Node.
 */
import { looksVietnamese } from "./vietnamese-text.ts";

/**
 * Chỉ còn mẫu "Hiện đại" (chủ sàn chốt 2026-11-20: bỏ "Thanh lịch" và "Trưng bày"). Hồ sơ đã lưu
 * mẫu cũ tự đọc thành "modern".
 */
export const STOREFRONT_TEMPLATES = ["modern"] as const;
export type StorefrontTemplate = (typeof STOREFRONT_TEMPLATES)[number];

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
/** Sản phẩm ghim đầu khu sản phẩm (chủ sàn chốt tối đa 4). */
export const STOREFRONT_MAX_FEATURED = 4;
/** Từ 8 sản phẩm trở lên thì có lọc theo danh mục. */
export const STOREFRONT_GROUP_MIN_PRODUCTS = 8;

/** Video nhà máy ở đầu trang (Cloudflare Stream, bấm mới phát). */
export type StorefrontHeroVideo = { video_uid: string; duration?: number; uploaded_at?: string };

export interface StorefrontTheme {
  template: StorefrontTemplate;
  tone: StorefrontTone;
  /** Câu giới thiệu bản tiếng Anh người mua thấy. */
  tagline: string;
  /** Câu giới thiệu nhà cung cấp viết (tiếng Việt), máy chủ dịch sang `tagline` khi lưu. */
  tagline_vi?: string;
  stats: StorefrontStat[];
  /** Mã sản phẩm ghim (tối đa 4, theo thứ tự). Sản phẩm không còn hiện thì tự bỏ khi hiển thị. */
  featured: string[];
  hero_video?: StorefrontHeroVideo;
}

export const DEFAULT_STOREFRONT_THEME: StorefrontTheme = {
  template: "modern",
  tone: "champagne",
  tagline: "",
  stats: ["capacity", "founded", "markets", "lead_time"],
  featured: [],
};

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

/** Đọc từ CSDL: giá trị lạ về mặc định, số liệu lọc trùng và giới hạn 4. */
export function normalizeStorefrontTheme(raw: unknown): StorefrontTheme {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const stats = Array.isArray(value.stats)
    ? [...new Set(value.stats.filter((item): item is StorefrontStat => isOneOf(STOREFRONT_STATS, item)))].slice(0, STOREFRONT_MAX_STATS)
    : DEFAULT_STOREFRONT_THEME.stats;
  const featured = Array.isArray(value.featured)
    ? [...new Set(value.featured.filter((id): id is string => typeof id === "string" && /^[a-z0-9-]{8,64}$/i.test(id)))].slice(0, STOREFRONT_MAX_FEATURED)
    : [];
  const video = value.hero_video && typeof value.hero_video === "object" ? value.hero_video as Record<string, unknown> : null;
  const hero_video = video && typeof video.video_uid === "string" && /^[a-f0-9]{32}$/i.test(video.video_uid)
    ? { video_uid: video.video_uid.toLowerCase(),
      ...(typeof video.duration === "number" && video.duration > 0 ? { duration: Math.round(video.duration) } : {}),
      ...(typeof video.uploaded_at === "string" && !Number.isNaN(Date.parse(video.uploaded_at)) ? { uploaded_at: video.uploaded_at } : {}) }
    : undefined;
  return {
    // Mẫu cũ (Thanh lịch, Trưng bày) đọc thành Hiện đại.
    template: "modern",
    tone: isOneOf(STOREFRONT_TONES, value.tone) ? value.tone : DEFAULT_STOREFRONT_THEME.tone,
    tagline: typeof value.tagline === "string" ? value.tagline.trim().slice(0, STOREFRONT_TAGLINE_MAX) : "",
    ...(typeof value.tagline_vi === "string" && value.tagline_vi.trim() ? { tagline_vi: value.tagline_vi.trim().slice(0, STOREFRONT_TAGLINE_MAX) } : {}),
    stats,
    featured,
    ...(hero_video ? { hero_video } : {}),
  };
}

export type ThemeInputProblem = "template" | "tone" | "stats" | "taglineTooLong" | "contact" | "language" | null;

const CONTACT = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/|www\.|\b[\w-]+\.(?:com|vn|net|org|io|co)\b|(?:\+?\d[\s().-]?){9,15}\d/i;

/** Kiểm tra lựa chọn của nhà cung cấp trước khi lưu. */
export function storefrontThemeProblem(input: { template?: unknown; tone: unknown; tagline: unknown; stats: unknown; language?: "en" | "any" }): ThemeInputProblem {
  if (input.template !== undefined && !isOneOf(STOREFRONT_TEMPLATES, input.template)) return "template";
  if (!isOneOf(STOREFRONT_TONES, input.tone)) return "tone";
  if (!Array.isArray(input.stats) || input.stats.length > STOREFRONT_MAX_STATS || !input.stats.every((item) => isOneOf(STOREFRONT_STATS, item))) return "stats";
  const tagline = typeof input.tagline === "string" ? input.tagline.trim() : "";
  if (tagline.length > STOREFRONT_TAGLINE_MAX) return "taglineTooLong";
  if (CONTACT.test(tagline)) return "contact";
  // Câu viết tiếng Việt (bản nhà cung cấp soạn) được phép; bản tiếng Anh người mua thấy thì không.
  if (input.language !== "any" && looksVietnamese(tagline)) return "language";
  return null;
}
