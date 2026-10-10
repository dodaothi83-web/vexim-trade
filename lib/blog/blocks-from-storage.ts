import type { Block } from "@/components/block-editor/types";
import { htmlToBlocks } from "@/lib/blog/content-parsers";

/**
 * Đọc cột `posts.content` về dạng khối để nạp vào trình soạn thảo.
 * - Chuỗi JSON của mảng khối: dùng trực tiếp.
 * - HTML cũ (bài trước khi có trình soạn khối): chuyển sang khối.
 * - Rỗng hoặc hỏng: trả về mảng rỗng, trình soạn sẽ tự tạo khối trống.
 */
export function normalizeBlocksFromStorage(content: string | null | undefined): Block[] {
  const raw = (content ?? "").trim();
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Block[]) : [];
  } catch {
    return htmlToBlocks(raw);
  }
}
