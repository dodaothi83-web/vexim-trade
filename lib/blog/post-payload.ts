import type { Block, BlockType } from "@/components/block-editor/types"
import { sanitizeInlineHtml, stripHtml } from "./sanitize"

/**
 * Chuẩn hoá + whitelist payload bài viết trước khi ghi vào DB.
 *
 * - Chống mass assignment: chỉ nhận đúng các cột của bảng `posts`.
 * - Sanitize nội dung khối (whitelist thẻ inline) ở phía server.
 * - Sinh slug an toàn và đảm bảo không trùng.
 */

const POST_COLUMNS = [
  "title",
  "slug",
  "excerpt",
  "content",
  "category",
  "featured_image",
  "featured_image_alt",
  "meta_title",
  "meta_description",
  "focus_keyword",
  "status",
  "published_at",
] as const

export const POST_LIST_COLUMNS =
  "id, title, slug, excerpt, category, featured_image, featured_image_alt, meta_title, meta_description, focus_keyword, status, published_at, created_at, updated_at, views_count, views_this_month"

export const POST_DETAIL_COLUMNS = `${POST_LIST_COLUMNS}, content`

const BLOCK_TYPES: BlockType[] = ["heading", "paragraph", "image", "quote", "table", "list"]
const ALIGNS = ["left", "center", "right", "justify"]
const WIDTHS = ["100%", "80%", "60%"]

export function slugify(input: string): string {
  const slug = String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80)

  return slug || "bai-viet"
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value)
}

function asPlainText(value: unknown): string {
  return stripHtml(asString(value)).slice(0, 500)
}

function asInlineHtml(value: unknown): string {
  return sanitizeInlineHtml(asString(value))
}

function asAlign(value: unknown, fallback = "left"): string {
  const align = asString(value)
  return ALIGNS.includes(align) ? align : fallback
}

function safeImageUrl(value: unknown): string {
  const url = asString(value).trim()
  if (!url) return ""
  if (/^(https?:\/\/|\/|data:image\/|blob:)/i.test(url)) return url.slice(0, 2000)
  return ""
}

/** Ép về số nguyên trong khoảng cho phép (dùng cho width/height của ảnh). */
function clampInt(value: unknown, min: number, max: number): number {
  const num = Math.round(Number(value))
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.min(Math.max(num, min), max)
}

function sanitizeBlockData(type: BlockType, data: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "heading":
      return {
        level: Math.min(Math.max(Number(data?.level) || 2, 1), 6),
        text: asInlineHtml(data?.text),
        align: asAlign(data?.align, "left"),
      }
    case "paragraph":
      return { text: asInlineHtml(data?.text), align: asAlign(data?.align, "justify") }
    case "quote":
      return { text: asInlineHtml(data?.text), author: asPlainText(data?.author), align: asAlign(data?.align, "left") }
    case "list":
      return {
        style: asString(data?.style) === "ordered" ? "ordered" : "unordered",
        items: Array.isArray(data?.items) ? (data.items as unknown[]).slice(0, 200).map(asInlineHtml) : [],
        align: asAlign(data?.align, "left"),
      }
    case "table": {
      let rawRows: unknown[] = []
      if (Array.isArray(data?.content)) {
        rawRows = data.content as unknown[]
      } else if (Array.isArray(data?.headers) || Array.isArray(data?.rows)) {
        const h = Array.isArray(data?.headers) ? [data.headers] : []
        const r = Array.isArray(data?.rows) ? (data.rows as unknown[]) : []
        rawRows = [...h, ...r]
      }
      const content = rawRows
        .slice(0, 200)
        .map((row) => (Array.isArray(row) ? (row as unknown[]).slice(0, 30).map(asInlineHtml) : []))
        .filter((row) => row.length > 0)

      return {
        rows: content.length,
        cols: content[0]?.length ?? 0,
        content,
        hasHeader: data?.hasHeader !== false,
        align: asAlign(data?.align, "left"),
      }
    }
    case "image":
      return {
        url: safeImageUrl(data?.url),
        alt: asPlainText(data?.alt),
        caption: asPlainText(data?.caption),
        width: WIDTHS.includes(asString(data?.width)) ? asString(data?.width) : "100%",
        // Kích thước thật của ảnh -> render thành width/height để chống nhảy layout (CLS)
        width_px: clampInt(data?.width_px, 0, 20000),
        height_px: clampInt(data?.height_px, 0, 20000),
        align: asAlign(data?.align, "center"),
      }
    default:
      return {}
  }
}

/** Chuẩn hoá mảng block (dùng cho cả payload JSON và dữ liệu cũ). */
export function sanitizeBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return []

  return input
    .slice(0, 1000)
    .map((raw, index) => {
      const block = (raw ?? {}) as Record<string, unknown>
      const type = BLOCK_TYPES.includes(asString(block.type) as BlockType)
        ? (asString(block.type) as BlockType)
        : "paragraph"
      const data = (block.data ?? {}) as Record<string, unknown>

      return {
        id: asString(block.id) || `block_${index}_${Math.random().toString(36).slice(2, 9)}`,
        type,
        data: sanitizeBlockData(type, data),
      } as Block
    })
    .filter((block) => {
      // Bỏ các khối rỗng hoàn toàn
      if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
        return stripHtml(asString((block.data as Record<string, unknown>).text)).length > 0
      }
      if (block.type === "list") {
        const items = ((block.data as Record<string, unknown>).items as string[]) || []
        return items.some((item) => stripHtml(item).length > 0)
      }
      if (block.type === "table") {
        const content = ((block.data as Record<string, unknown>).content as string[][]) || []
        return content.some((row) => row.some((cell) => stripHtml(cell).length > 0))
      }
      if (block.type === "image") {
        return !!((block.data as Record<string, unknown>).url as string)
      }
      return true
    })
}

/** Nhận `content` (JSON string hoặc mảng) và trả về JSON string đã sanitize + có block. */
export function sanitizeContent(content: unknown): { json: string; blockCount: number; plainText: string } {
  let parsed: unknown = content

  if (typeof content === "string") {
    const trimmed = content.trim()
    if (!trimmed) return { json: "[]", blockCount: 0, plainText: "" }

    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // Bài viết định dạng HTML cũ -> giữ nguyên HTML nhưng sanitize
      const html = trimmed
      return { json: html, blockCount: 0, plainText: stripHtml(html) }
    }
  }

  const blocks = sanitizeBlocks(parsed)
  const plainText = blocks
    .map((block) => {
      const data = block.data as Record<string, unknown>
      if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
        return stripHtml(asString(data.text))
      }
      if (block.type === "list") return ((data.items as string[]) || []).map(stripHtml).join(" ")
      if (block.type === "table") return ((data.content as string[][]) || []).flat().map(stripHtml).join(" ")
      return ""
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  return { json: JSON.stringify(blocks), blockCount: blocks.length, plainText }
}

export interface BuildPayloadOptions {
  /** PUT: chỉ cập nhật các trường có mặt trong body */
  partial?: boolean
  /** Đổi slug khi tiêu đề thay đổi (mặc định chỉ tạo slug mới nếu client gửi slug) */
  regenerateSlug?: boolean
}

export interface BuiltPostPayload {
  payload: Record<string, unknown>
  errors: string[]
  /** Độ dài text thuần của nội dung (để validate khi publish). */
  plainTextLength: number
}

/** Whitelist + validate payload bài viết. */
export function buildPostPayload(body: Record<string, unknown>, options: BuildPayloadOptions = {}): BuiltPostPayload {
  const errors: string[] = []
  const payload: Record<string, unknown> = {}
  let plainTextLength = 0

  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
  const shouldInclude = (key: string) => !options.partial || has(key)

  if (shouldInclude("title")) {
    const title = asString(body.title).trim()
    if (!title) errors.push("Tiêu đề bài viết không được để trống")
    payload.title = title.slice(0, 300)
  }

  if (shouldInclude("excerpt")) {
    payload.excerpt = asString(body.excerpt).trim().slice(0, 500)
  }

  if (shouldInclude("category")) {
    const category = asString(body.category).trim()
    if (!category) errors.push("Danh mục không được để trống")
    payload.category = category.slice(0, 100)
  }

  if (shouldInclude("content")) {
    const { json, blockCount, plainText } = sanitizeContent(body.content)
    if (blockCount === 0 && !plainText) errors.push("Nội dung bài viết không được để trống")
    payload.content = json
    plainTextLength = plainText.length
  }

  if (shouldInclude("featured_image")) payload.featured_image = safeImageUrl(body.featured_image)
  if (shouldInclude("featured_image_alt")) payload.featured_image_alt = asPlainText(body.featured_image_alt)
  if (shouldInclude("meta_title")) payload.meta_title = asPlainText(body.meta_title).slice(0, 200)
  if (shouldInclude("meta_description")) payload.meta_description = asPlainText(body.meta_description).slice(0, 300)
  if (shouldInclude("focus_keyword")) payload.focus_keyword = asPlainText(body.focus_keyword).slice(0, 100)

  if (shouldInclude("slug")) {
    const slug = slugify(asString(body.slug))
    if (slug) payload.slug = slug
  }

  if (shouldInclude("status")) {
    const status = asString(body.status)
    payload.status = status === "published" ? "published" : "draft"
  }

  if (has("published_at") && body.published_at) {
    payload.published_at = asString(body.published_at)
  }

  // Đảm bảo chỉ gồm các cột hợp lệ (chống mass assignment)
  Object.keys(payload).forEach((key) => {
    if (!POST_COLUMNS.includes(key as (typeof POST_COLUMNS)[number])) {
      delete payload[key]
    }
  })

  return { payload, errors, plainTextLength }
}

/** Tạo slug duy nhất: nếu trùng thì thêm hậu tố -2, -3... */
export async function ensureUniqueSlug(
  supabase: { from: (table: string) => any },
  baseSlug: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(baseSlug)
  let candidate = base
  let suffix = 2

  // Tối đa 50 lần thử để tránh vòng lặp vô hạn
  for (let attempt = 0; attempt < 50; attempt++) {
    let query = supabase.from("posts").select("id").eq("slug", candidate).limit(1)
    if (excludeId) query = query.neq("id", excludeId)

    const { data, error } = await query
    if (error) break
    if (!data || data.length === 0) return candidate

    candidate = `${base.slice(0, 70)}-${suffix}`
    suffix += 1
  }

  // Fallback: thêm hậu tố ngẫu nhiên
  return `${base.slice(0, 60)}-${Date.now().toString(36)}`
}
