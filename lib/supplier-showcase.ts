/**
 * Khối nội dung hình ảnh trên trang nhà cung cấp (gói Premium/Pro).
 *
 * Mỗi khối: một ảnh, tiêu đề ngắn, đoạn mô tả. Nội dung do nhà cung cấp tự viết nên chặn
 * email, đường dẫn và số điện thoại ngay khi lưu: người mua liên hệ qua Vexim, không qua
 * thông tin trên trang. Trang công khai vẫn lọc thêm một lần khi hiển thị.
 *
 * Người mua là khách quốc tế nên nội dung phải viết bằng tiếng Anh, giống mọi chữ khác
 * trên trang công khai.
 */
import { looksVietnamese } from "./vietnamese-text.ts";

export const SHOWCASE_MAX_BLOCKS = 6;
export const SHOWCASE_TITLE_MAX = 80;
export const SHOWCASE_BODY_MAX = 400;

export interface ShowcaseBlock {
  id: string;
  image_path: string;
  title: string;
  body: string;
}

const EMAIL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const LINK = /https?:\/\/|www\.|\b[\w-]+\.(?:com|vn|net|org|io|co)\b/i;
const PHONE = /(?:\+?\d[\s().-]?){9,15}\d/;

/** Có email, đường dẫn hoặc số điện thoại không. */
export function showcaseHasContact(text: string): boolean {
  return EMAIL.test(text) || LINK.test(text) || PHONE.test(text);
}

/** Đọc dữ liệu từ CSDL: bỏ khối hỏng, giữ đúng giới hạn. */
export function normalizeShowcaseBlocks(raw: unknown): ShowcaseBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      image_path: typeof item.image_path === "string" ? item.image_path : "",
      title: typeof item.title === "string" ? item.title.trim().slice(0, SHOWCASE_TITLE_MAX) : "",
      body: typeof item.body === "string" ? item.body.trim().slice(0, SHOWCASE_BODY_MAX) : "",
    }))
    .filter((block) => block.id && block.image_path && block.title)
    .slice(0, SHOWCASE_MAX_BLOCKS);
}

export type ShowcaseTextProblem = "titleRequired" | "titleTooLong" | "bodyTooLong" | "contact" | "language" | null;

export function showcaseTextProblem(title: string, body: string): ShowcaseTextProblem {
  if (!title.trim()) return "titleRequired";
  if (title.trim().length > SHOWCASE_TITLE_MAX) return "titleTooLong";
  if (body.trim().length > SHOWCASE_BODY_MAX) return "bodyTooLong";
  if (showcaseHasContact(`${title} ${body}`)) return "contact";
  if (looksVietnamese(`${title} ${body}`)) return "language";
  return null;
}

/** Đổi chỗ một khối lên/xuống; trả mảng mới. */
export function moveShowcaseBlock(blocks: ShowcaseBlock[], id: string, direction: -1 | 1): ShowcaseBlock[] {
  const index = blocks.findIndex((block) => block.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= blocks.length) return blocks;
  const next = [...blocks];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Khối hiển thị công khai: bỏ khối viết bằng tiếng Việt (dữ liệu cũ hoặc nhập ngoài form). */
export function publicShowcaseBlocks(raw: unknown): ShowcaseBlock[] {
  return normalizeShowcaseBlocks(raw).filter((block) => !looksVietnamese(`${block.title} ${block.body}`));
}
