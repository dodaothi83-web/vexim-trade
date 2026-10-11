import type { Block } from "./types"
import { blocksToHTML } from "@/lib/blocks-to-html"

interface BlockRendererProps {
  blocks: Block[]
}

/**
 * Render khối ở phía client (xem trước).
 *
 * Trước đây file này có bản render riêng, khác với `blocksToHTML()` dùng ở trang blog
 * công khai (cỡ heading khác, không render công thức LaTeX, không sanitize) nên bản
 * xem trước không giống bài thật. Giờ dùng chung một hàm render duy nhất.
 */
export function BlockRenderer({ blocks }: BlockRendererProps) {
  const html = blocksToHTML(blocks)

  if (!html) return null

  return (
    <div
      className="prose prose-lg max-w-none prose-headings:text-brand-700 prose-h2:text-3xl prose-h2:font-bold prose-h2:mb-4 prose-h2:mt-8 prose-h3:text-2xl prose-h3:font-bold prose-h3:mb-3 prose-h3:mt-6 prose-p:text-base prose-p:leading-relaxed prose-p:mb-4 prose-ul:my-4 prose-li:text-base prose-li:leading-relaxed prose-a:text-brand-700 prose-a:underline prose-figure:my-8 prose-figcaption:mt-3 prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:italic prose-figcaption:text-ink-500 prose-img:rounded-lg prose-img:shadow-md"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
