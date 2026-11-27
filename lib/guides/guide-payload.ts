import type { Block } from "@/components/block-editor/types";
import { sanitizeBlocks, slugify } from "@/lib/blog/post-payload";
import { stripHtml } from "@/lib/blog/sanitize";
import type { PostStatus, SupplierGuideInput } from "@/lib/types";
import { GUIDE_TOPIC_SLUGS } from "./topics";

/** Khối bài hướng dẫn được phép dùng ngoài khối blog gốc. */
export const GUIDE_EXTRA_BLOCKS = ["video", "callout"] as const;

/** Xuất bản cần nội dung thật, tránh đăng bài rỗng (cùng ngưỡng với blog). */
export const GUIDE_MIN_PUBLISH_CHARS = 50;

export function guideBlocksPlainText(blocks: Block[]): string {
  return blocks.map((block) => {
    const data = (block.data ?? {}) as Record<string, unknown>;
    if (block.type === "list") return ((data.items as string[]) ?? []).map(stripHtml).join(" ");
    if (block.type === "table") return ((data.content as string[][]) ?? []).flat().map(stripHtml).join(" ");
    if (block.type === "video") return stripHtml(String(data.caption ?? ""));
    return stripHtml(String(data.text ?? ""));
  }).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Phút đọc: 200 từ/phút, mỗi video tính thêm 2 phút; tối thiểu 1 phút. */
export function guideReadingMinutes(blocks: Block[]): number {
  const words = guideBlocksPlainText(blocks).split(" ").filter(Boolean).length;
  const videos = blocks.filter((block) => block.type === "video").length;
  return Math.max(1, Math.round(words / 200 + videos * 2));
}

/** Số bước: đếm mục của danh sách đánh số; không có thì đếm tiêu đề cấp 2. */
export function guideStepCount(blocks: Block[]): number {
  const ordered = blocks.filter((block) => block.type === "list" && (block.data as { style?: string })?.style === "ordered")
    .reduce((sum, block) => sum + (((block.data as { items?: string[] }).items ?? []).filter((item) => stripHtml(item).trim()).length), 0);
  if (ordered) return ordered;
  return blocks.filter((block) => block.type === "heading" && Number((block.data as { level?: number }).level) === 2).length;
}

export type BuiltGuide = { input: SupplierGuideInput; errors: string[]; plainTextLength: number };

/** Whitelist + kiểm tra dữ liệu bài hướng dẫn trước khi ghi (chống ghi đè cột ngoài ý muốn). */
export function buildGuideInput(body: Record<string, unknown>): BuiltGuide {
  const text = (value: unknown, max: number) => (typeof value === "string" ? value : "").replace(/\s+/g, " ").trim().slice(0, max);
  const errors: string[] = [];
  const title = stripHtml(text(body.title, 200));
  if (!title) errors.push("Tiêu đề không được để trống");
  const topic = text(body.topic, 40);
  if (!GUIDE_TOPIC_SLUGS.includes(topic)) errors.push("Chọn chủ đề cho bài hướng dẫn");
  const summary = stripHtml(text(body.summary, 300)) || null;
  let raw: unknown = body.content;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = []; } }
  const blocks = sanitizeBlocks(raw, { extraTypes: [...GUIDE_EXTRA_BLOCKS] });
  const plainTextLength = guideBlocksPlainText(blocks).length;
  const order = Math.trunc(Number(body.sort_order));
  const status: PostStatus = body.status === "published" ? "published" : "draft";
  return {
    errors,
    plainTextLength,
    input: {
      title,
      slug: slugify(text(body.slug, 80) || title),
      topic,
      summary,
      content: JSON.stringify(blocks),
      sort_order: Number.isFinite(order) ? Math.min(Math.max(order, 0), 999) : 0,
      status,
      published_at: null,
    },
  };
}

/** Slug duy nhất trong bảng hướng dẫn: trùng thì thêm -2, -3... */
export async function ensureUniqueGuideSlug(
  store: { getSupplierGuideBySlug(slug: string): Promise<{ id: string } | null> },
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  for (let suffix = 2; suffix < 52; suffix++) {
    const existing = await store.getSupplierGuideBySlug(candidate);
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${root.slice(0, 70)}-${suffix}`;
  }
  return `${root.slice(0, 60)}-${Date.now().toString(36)}`;
}
