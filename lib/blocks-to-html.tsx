import type { Block } from "@/components/block-editor/types"
import { escapeAttr, escapeHtml, sanitizeInlineHtml, stripHtml } from "@/lib/blog/sanitize"
import { buildHeadingAnchors, injectHeadingAnchors } from "@/lib/blog/heading-anchors"

// Parse HTML -> blocks (dùng cho Import HTML & bài viết định dạng cũ)
export { htmlToBlocks } from "@/lib/blog/content-parsers"

/**
 * Map of common LaTeX commands to their Unicode equivalents.
 * Used to display inline math symbols (e.g. "$\ge$ 98%") that appear in
 * AI-generated content as proper characters instead of raw LaTeX source.
 */
const LATEX_SYMBOLS: Record<string, string> = {
  ge: "≥",
  geq: "≥",
  le: "≤",
  leq: "≤",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  cdot: "·",
  ast: "∗",
  star: "⋆",
  bullet: "•",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  sum: "∑",
  prod: "∏",
  int: "∫",
  sqrt: "√",
  propto: "∝",
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cup: "∪",
  cap: "∩",
  emptyset: "∅",
  rightarrow: "→",
  Rightarrow: "⇒",
  leftarrow: "←",
  Leftarrow: "⇐",
  leftrightarrow: "↔",
  Leftrightarrow: "⇔",
  uparrow: "↑",
  downarrow: "↓",
  degree: "°",
  circ: "°",
  percent: "%",
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  theta: "θ",
  lambda: "λ",
  mu: "µ",
  pi: "π",
  sigma: "σ",
  phi: "φ",
  omega: "ω",
  Delta: "Δ",
  Sigma: "Σ",
  Omega: "Ω",
  Phi: "Φ",
  Pi: "Π",
  ldots: "…",
  dots: "…",
  to: "→",
  leq_slant: "⩽",
}

/**
 * Replace LaTeX backslash commands within a string with Unicode characters.
 */
function replaceLatexCommands(input: string): string {
  let result = input
  // Replace \command (longest names first to avoid partial matches)
  const names = Object.keys(LATEX_SYMBOLS).sort((a, b) => b.length - a.length)
  for (const name of names) {
    const re = new RegExp(`\\\\${name}\\b`, "g")
    result = result.replace(re, LATEX_SYMBOLS[name])
  }
  // Remove any leftover LaTeX spacing/formatting helpers
  result = result.replace(/\\,/g, " ").replace(/\\;/g, " ").replace(/\\!/g, "").replace(/\\ /g, " ")
  return result
}

/**
 * Convert inline ($...$) and display ($$...$$) LaTeX math expressions found in
 * text content into readable Unicode. Falls back to stripping the delimiters
 * so users never see raw "$\ge$" markup in the rendered article.
 */
export function renderInlineMath(text: string): string {
  if (!text || text.indexOf("$") === -1) return text

  // Display math: $$ ... $$
  let result = text.replace(/\$\$([^$]+)\$\$/g, (_m, expr) => replaceLatexCommands(expr).trim())
  // Inline math: $ ... $
  result = result.replace(/\$([^$]+)\$/g, (_m, expr) => replaceLatexCommands(expr).trim())

  return result
}

const ALIGN_CLASSES: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
}

function alignmentClass(align: unknown, fallback = "left"): string {
  const key = typeof align === "string" ? align : fallback
  return ALIGN_CLASSES[key] ?? ALIGN_CLASSES[fallback]
}

/** Nội dung inline của khối: sanitize (whitelist) -> render công thức -> giữ HTML an toàn. */
function renderInline(raw: unknown): string {
  return renderInlineMath(sanitizeInlineHtml(raw))
}

/**
 * Text thuần (không cho HTML): dùng cho thẻ `alt` của ảnh — trình đọc màn hình và
 * Google đọc nguyên văn, nên nếu để lọt "<strong>" thì alt sẽ hiển thị thẻ.
 */
function renderPlainText(raw: unknown): string {
  return renderInlineMath(stripHtml(String(raw ?? "")))
}

function safeUrl(url: unknown): string {
  const value = String(url ?? "").trim()
  if (!value) return ""
  if (/^(https?:\/\/|\/|data:image\/|blob:)/i.test(value)) return value
  return ""
}

function headingSizeClass(level: number): string {
  switch (level) {
    case 1:
      return "text-4xl md:text-5xl"
    case 2:
      return "text-3xl md:text-4xl"
    case 3:
      return "text-2xl md:text-3xl"
    case 4:
      return "text-xl md:text-2xl"
    case 5:
      return "text-lg md:text-xl"
    default:
      return "text-base md:text-lg"
  }
}

/**
 * Convert block editor blocks to HTML string for display
 */
export function blocksToHTML(blocks: Block[]): string {
  if (!blocks || blocks.length === 0) {
    return ""
  }

  // id cho từng heading (theo thứ tự xuất hiện) để có anchor/jump link trong HTML gốc
  const anchorIds = buildHeadingAnchors(blocks)

  const html = blocks
    .map((block) => {
      const { type, data = {} } = block
      const align = alignmentClass(data.align)

      switch (type) {
        case "heading": {
          const level = Math.min(Math.max(Number(data.level) || 2, 1), 6)
          // id được gắn một lần ở cuối bằng injectHeadingAnchors() — tránh hai nguồn dữ liệu
          // `scroll-mt-24`: bù cho header dính khi nhảy tới mục từ mục lục / link chia sẻ
          return `<h${level} class="scroll-mt-24 ${headingSizeClass(level)} font-bold text-brand-700 mb-4 mt-8 first:mt-0 ${align}">${renderInline(
            data.text,
          )}</h${level}>`
        }

        case "paragraph": {
          return `<p class="text-base leading-relaxed mb-4 ${align}">${renderInline(data.text)}</p>`
        }

        case "image": {
          const imageAlign: Record<string, string> = {
            left: "justify-start",
            center: "justify-center",
            right: "justify-end",
          }
          const justify = imageAlign[typeof data.align === "string" ? data.align : "center"] ?? "justify-center"

          const widthClass = data.width === "100%" ? "w-full" : data.width === "80%" ? "w-4/5 mx-auto" : "w-3/5 mx-auto"

          const src = safeUrl(data.url)
          if (!src) return ""

          const caption = String(data.caption ?? "").trim()
          // Alt ưu tiên đúng trường `alt` của khối (trước đây bị lấy nhầm từ caption -> mất SEO)
          const alt = renderPlainText(data.alt).trim() || caption

          const captionHtml = caption
            ? `<figcaption class="text-center text-sm text-gray-600 italic mt-3">${escapeHtml(caption)}</figcaption>`
            : ""

          // width/height (nếu có) giúp trình duyệt chừa sẵn chỗ -> giảm CLS
          const width = Number(data.width_px) || 0
          const height = Number(data.height_px) || 0
          const sizeAttrs = width > 0 && height > 0 ? ` width="${width}" height="${height}"` : ""

          return `<figure class="${widthClass} my-8"><img src="${escapeAttr(src)}" alt="${escapeAttr(
            alt,
          )}"${sizeAttrs} loading="lazy" decoding="async" class="w-full h-auto rounded-lg shadow-md" />${captionHtml}</figure>`
        }

        case "quote": {
          const author = String(data.author ?? "").trim()
          const authorHtml = author
            ? `<footer class="mt-2 text-sm font-semibold text-gray-700">— ${escapeHtml(author)}</footer>`
            : ""

          return `<blockquote class="border-l-4 border-brand-700 pl-4 py-2 my-6 italic ${align}"><p class="text-lg text-gray-600">${renderInline(
            data.text,
          )}</p>${authorHtml}</blockquote>`
        }

        case "list": {
          const items = (data.items || [])
            .map((item: string) => `<li class="mb-2">${renderInline(item)}</li>`)
            .join("")

          const ordered = data.style === "ordered"
          const listTag = ordered ? "ol" : "ul"
          const listClass = ordered ? "list-decimal list-inside my-4 space-y-2" : "list-disc list-inside my-4 space-y-2"

          return `<${listTag} class="${listClass} ${align}">${items}</${listTag}>`
        }

        case "table": {
          let rows: string[][] = []
          let hasHeader = data.hasHeader !== false

          if (Array.isArray(data.content) && data.content.length > 0) {
            rows = data.content
          } else if (Array.isArray(data.headers) || Array.isArray(data.rows)) {
            const headerArr = Array.isArray(data.headers) ? [data.headers] : []
            const bodyArr = Array.isArray(data.rows) ? data.rows : []
            rows = [...headerArr, ...bodyArr]
            hasHeader = headerArr.length > 0
          }

          if (rows.length === 0) {
            return ""
          }

          // Tôn trọng cờ hasHeader (trước đây luôn coi hàng đầu là header)
          const effectiveHasHeader = hasHeader && rows.length > 0
          const headerRow = effectiveHasHeader ? rows[0] : null
          const bodyRows = effectiveHasHeader ? rows.slice(1) : rows

          const renderRow = (row: string[], cellTag: "th" | "td") =>
            `<tr>${(Array.isArray(row) ? row : [])
              .map((cell) => {
                const className =
                  cellTag === "th"
                    ? "border border-ink-200 px-4 py-3 bg-ink-100 text-brand-700 font-semibold text-left align-top"
                    : "border border-ink-200 px-4 py-3 align-top"
                const scope = cellTag === "th" ? ' scope="col"' : ""
                return `<${cellTag}${scope} class="${className}">${renderInline(cell)}</${cellTag}>`
              })
              .join("")}</tr>`

          const thead = headerRow ? `<thead>${renderRow(headerRow, "th")}</thead>` : ""
          const tbody = `<tbody>${bodyRows.map((row) => renderRow(row, "td")).join("")}</tbody>`

          return `<div class="my-6 overflow-x-auto rounded-lg border border-ink-200"><table class="border-collapse w-full">${thead}${tbody}</table></div>`
        }

        default:
          return ""
      }
    })
    .filter(Boolean)
    .join("\n")

  // Gắn id vào chuỗi HTML theo thứ tự để mục lục và link chia sẻ hoạt động không cần JS
  return injectHeadingAnchors(html, anchorIds)
}
