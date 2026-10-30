/**
 * Sanitize / escape helpers dùng chung cho module blog.
 *
 * Mục đích:
 * - `sanitizeInlineHtml`: whitelist các thẻ inline an toàn (dùng cho nội dung khối
 *   paragraph/heading/quote/list/table) — chạy được cả trên server (không cần DOM).
 * - `escapeHtml` / `escapeAttr`: escape khi nối chuỗi HTML (attribute, caption, alt...).
 * - `stripHtml`: lấy text thuần để đếm từ / tìm kiếm.
 */

const ALLOWED_INLINE_TAGS = new Set([
  "strong",
  "b",
  "em",
  "i",
  "u",
  "a",
  "code",
  "br",
  "span",
  "sub",
  "sup",
  "mark",
  "small",
])

/** Thẻ bị xoá hoàn toàn (cả nội dung) vì có thể chạy mã hoặc tải tài nguyên ngoài. */
const DANGEROUS_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "link",
  "meta",
  "svg",
  "math",
  "base",
  "applet",
  "frame",
  "frameset",
  "noscript",
  "template",
]

/** Thẻ block: khi bị "unwrap" cần thêm khoảng trắng để không dính chữ. */
const BLOCK_LEVEL_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
])

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/|#|\?)/i
const SAFE_REL = new Set(["nofollow", "noopener", "noreferrer", "ugc", "sponsored"])

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** Lấy text thuần từ HTML (dùng để đếm từ, tìm kiếm, preview). */
export function stripHtml(value: string): string {
  if (!value) return ""
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function readAttribute(attrs: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i")
  const match = attrs.match(re)
  if (!match) return null
  return (match[1] ?? match[2] ?? match[3] ?? "").trim()
}

/**
 * Whitelist sanitizer cho HTML inline.
 * - Xoá hoàn toàn các thẻ nguy hiểm (script, style, iframe...) kể cả nội dung.
 * - Giữ các thẻ inline trong danh sách trắng, bỏ mọi attribute ngoại trừ `href` (an toàn)
 *   cùng `target`/`rel` được lọc của thẻ `<a>`.
 * - Các thẻ khác bị "unwrap" (giữ nội dung) và thêm khoảng trắng nếu là thẻ block.
 */
export function sanitizeInlineHtml(input: unknown): string {
  let html = String(input ?? "")
  if (!html) return ""

  // 1. Xoá comment HTML
  html = html.replace(/<!--[\s\S]*?-->/g, "")

  // 2. Xoá các thẻ nguy hiểm kèm nội dung (có thẻ đóng)
  const paired = DANGEROUS_TAGS.join("|")
  html = html.replace(new RegExp(`<(${paired})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "")
  // 3. Xoá các thẻ nguy hiểm dạng rỗng / tự đóng
  html = html.replace(new RegExp(`<\\/?(?:${paired})\\b[^>]*>`, "gi"), "")

  // 3b. Với thẻ <a> có href không an toàn: bỏ cả cặp thẻ nhưng giữ phần chữ bên trong
  //     (nếu chỉ bỏ thẻ mở sẽ còn lại `</a>` lơ lửng trong nội dung).
  html = html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (match, rawAttrs: string, inner: string) => {
    const href = readAttribute(rawAttrs, "href")
    if (!href || !SAFE_URL.test(href) || /javascript:/i.test(href)) return inner
    return match
  })

  // 4. Xử lý mọi thẻ còn lại
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g, (_match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase()
    const isClosing = _match.startsWith("</")

    if (!ALLOWED_INLINE_TAGS.has(tag)) {
      // Unwrap: bỏ thẻ, giữ nội dung; thẻ block thêm khoảng trắng để không dính chữ
      return BLOCK_LEVEL_TAGS.has(tag) ? " " : ""
    }

    if (tag === "br") return "<br />"
    if (isClosing) return `</${tag}>`

    if (tag === "a") {
      const href = readAttribute(rawAttrs, "href")
      if (!href || !SAFE_URL.test(href) || /javascript:/i.test(href)) return ""
      const target = readAttribute(rawAttrs, "target")
      const relTokens = (readAttribute(rawAttrs, "rel") || "")
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => SAFE_REL.has(token))
      const isExternal = /^https?:\/\//i.test(href)
      if (isExternal && target === "_blank" && !relTokens.includes("noopener")) {
        relTokens.push("noopener", "noreferrer")
      }
      const targetAttr = target === "_blank" ? ' target="_blank"' : ""
      const relAttr = relTokens.length > 0 ? ` rel="${escapeAttr([...new Set(relTokens)].join(" "))}"` : ""
      return `<a href="${escapeAttr(href)}"${targetAttr}${relAttr}>`
    }

    // Các thẻ inline khác: bỏ toàn bộ attribute
    return `<${tag}>`
  })

  // 5. Gộp khoảng trắng thừa do unwrap
  html = html.replace(/\s{2,}/g, " ").trim()

  return html
}
