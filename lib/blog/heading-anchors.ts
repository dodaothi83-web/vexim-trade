/**
 * Anchor (id) cho heading — dùng chung giữa server và client.
 *
 * Trước đây `blocksToHTML()` không sinh `id` cho heading nên:
 * - không có jump link trong HTML gốc (Google/AI khó trích dẫn theo đoạn, không share được link tới mục),
 * - component mục lục phải gán `heading-N` bằng JS sau 100ms (dễ lệch, phụ thuộc hydration).
 *
 * Cách làm: id = slug hoá nội dung heading + hậu tố `-2`, `-3` khi trùng.
 * - `buildHeadingAnchors()` / `injectHeadingAnchors()` dùng cho đường đi từ block (JSON).
 * - `ensureHeadingAnchors()` là lớp bọc an toàn: chạy trên HTML đã render cuối cùng,
 *   giữ nguyên id đã có, bù id cho heading còn thiếu (bài lưu dạng HTML thô) và
 *   trả về danh sách heading cho mục lục — nhờ vậy mục lục luôn khớp với HTML thật.
 */

import type { Block } from "@/components/block-editor/types"
import { stripHtml } from "./sanitize"

export interface HeadingAnchor {
  id: string
  text: string
  level: number
}

/** Bỏ dấu tiếng Việt + ký tự đặc biệt để tạo id ổn định, dễ đọc. */
export function slugifyHeading(text: string): string {
  const slug = stripHtml(String(text ?? ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60)

  return slug || "muc"
}

/**
 * Tạo danh sách id (theo đúng thứ tự heading xuất hiện trong block).
 * Heading rỗng giữ chỗ bằng chuỗi "" để chỉ số không bị lệch so với HTML render ra.
 */
export function buildHeadingAnchors(blocks: Block[] | undefined | null): string[] {
  const used = new Set<string>()
  const ids: string[] = []

  for (const block of blocks ?? []) {
    if (block?.type !== "heading") continue

    const text = String((block.data as { text?: unknown } | undefined)?.text ?? "")
    if (!stripHtml(text)) {
      ids.push("")
      continue
    }

    const base = slugifyHeading(text)
    let id = base
    let counter = 2
    while (used.has(id)) {
      id = `${base}-${counter}`
      counter += 1
    }
    used.add(id)
    ids.push(id)
  }

  return ids
}

/**
 * Gắn id vào các thẻ heading trong chuỗi HTML (theo thứ tự), dùng danh sách id
 * đã tính từ block. Heading đã có sẵn id thì giữ nguyên (không tiêu tốn id tiếp theo).
 */
export function injectHeadingAnchors(html: string, ids: string[]): string {
  if (!html || ids.length === 0) return html

  let index = 0

  return html.replace(/<h([2-6])\b([^>]*)>/gi, (match, level: string, attrs: string) => {
    if (/\sid\s*=/.test(attrs)) return match
    const id = ids[index]
    index += 1
    if (!id) return match
    return `<h${level}${attrs} id="${id}">`
  })
}

/**
 * Bảo đảm mọi heading (h2–h6) trong HTML cuối cùng đều có id duy nhất, và trả về
 * danh sách heading để render mục lục. Idempotent: chạy lại không đổi kết quả.
 */
export function ensureHeadingAnchors(html: string): { html: string; headings: HeadingAnchor[] } {
  if (!html) return { html, headings: [] }

  const used = new Set<string>()
  const headings: HeadingAnchor[] = []

  const processed = html.replace(
    /<h([2-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (match, levelRaw: string, attrs: string, inner: string) => {
      const level = Number(levelRaw)
      const text = stripHtml(inner).replace(/\s+/g, " ").trim()

      const existing = /\sid\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]
      let id = existing || slugifyHeading(text)

      if (used.has(id)) {
        const base = id
        let counter = 2
        while (used.has(`${base}-${counter}`)) counter += 1
        id = `${base}-${counter}`
      }
      used.add(id)

      headings.push({ id, text, level })

      if (existing) return match
      // `scroll-mt-24`: bù cho header dính khi nhảy tới mục từ mục lục / link chia sẻ
      const nextAttrs = /class\s*=\s*"/i.test(attrs)
        ? attrs.replace(/class\s*=\s*"/i, 'class="scroll-mt-24 ')
        : `${attrs} class="scroll-mt-24"`
      return `<h${level}${nextAttrs} id="${id}">`
    },
  )

  return { html: processed, headings }
}
