import type { Block } from "@/components/block-editor/types"
import { sanitizeInlineHtml, stripHtml } from "./sanitize"

/**
 * Bộ parser dùng chung cho module blog (1 nguồn duy nhất).
 *
 * Hỗ trợ chuyển đổi chuẩn xác từ:
 * - Google Docs (xử lý wrapper <b style="font-weight:normal">, bảng <table>, danh sách, tiêu đề)
 * - Microsoft Word (xử lý MsoNormal, MsoListParagraph, MsoNormalTable, outline-level)
 * - Excel / Google Sheets (bảng HTML & bảng phân cách bằng phím Tab \t)
 * - Gemini / ChatGPT / Claude / Notion (HTML & Markdown hỗn hợp, bảng Markdown có/không có dấu | ở mép)
 */

export interface ParsedTableData {
  rows: number
  cols: number
  content: string[][]
  hasHeader: boolean
}

export interface ParsedBlock {
  type: "heading" | "paragraph" | "quote" | "list" | "table" | "image"
  text: string
  level?: 1 | 2 | 3 | 4 | 5 | 6
  style?: "ordered" | "unordered"
  items?: string[]
  tableData?: ParsedTableData
  imageData?: {
    url: string
    alt: string
    caption: string
    width: string
  }
}

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"]
const CONTAINER_TAGS = [
  "div",
  "section",
  "article",
  "main",
  "aside",
  "header",
  "footer",
  "figure",
  "figcaption",
  "center",
  "dd",
  "dt",
  "dl",
  "fieldset",
  "details",
  "summary",
  "google-sheets-html-origin",
]

let blockIdCounter = 0

export function generateBlockId(prefix = "block"): string {
  blockIdCounter += 1
  return `${prefix}_${blockIdCounter}_${Math.random().toString(36).slice(2, 11)}`
}

/* ------------------------------------------------------------------ */
/* Markdown & TSV (Tab-Separated Values)                               */
/* ------------------------------------------------------------------ */

/** Chuyển markdown inline (bold/italic/link/code) sang HTML inline. */
export function parseInlineMarkdown(text: string): string {
  let result = String(text ?? "")

  // Code trước để không bị các regex khác phá
  const codeTokens: string[] = []
  result = result.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeTokens.push(`<code>${code}</code>`)
    return `\u0000CODE${codeTokens.length - 1}\u0000`
  })

  // Bold: **text** hoặc __text__
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  result = result.replace(/__(.+?)__/g, "<strong>$1</strong>")

  // Italic: *text* hoặc _text_
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "<em>$1</em>")

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const safeHref = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href) ? href : ""
    if (!safeHref) return label
    return `<a href="${safeHref}">${label}</a>`
  })

  // Trả lại code
  result = result.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx: string) => codeTokens[Number(idx)] ?? "")

  return result
}

/** Kiểm tra xem một dòng có phải là dòng phân cách bảng Markdown (VD: |---|---| hoặc --- | ---) không */
function isMarkdownTableSeparator(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes("|") || !trimmed.includes("-")) return false
  return /^\|?[\s\-:|]+\|[\s\-:|]+\|?$/.test(trimmed)
}

/** Kiểm tra xem một dòng có phải là một hàng của bảng Markdown không */
function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.includes("|")) return false
  if (trimmed.startsWith("|") && trimmed.endsWith("|")) return true
  // Hỗ trợ cả bảng Markdown không có dấu | ở 2 đầu nhưng có ít nhất 1 dấu | chia cột
  const parts = trimmed.split("|")
  return parts.length >= 2
}

/** Tách các ô trên một dòng bảng Markdown */
function splitMarkdownTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1)
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1)
  return trimmed.split("|").map((cell) => sanitizeInlineHtml(parseInlineMarkdown(cell.trim())))
}

/** Parse bảng markdown (đã tách thành các dòng). Trả về `null` nếu không hợp lệ. */
export function parseMarkdownTable(lines: string[]): ParsedTableData | null {
  if (!lines || lines.length < 2) return null

  const rows: string[][] = []
  let separatorIndex = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Dòng phân cách: |---|---| hoặc --- | ---
    if (isMarkdownTableSeparator(line)) {
      separatorIndex = i
      continue
    }

    const cells = splitMarkdownTableRow(line)
    if (cells.length > 0) rows.push(cells)
  }

  if (rows.length === 0) return null

  const maxCols = Math.max(...rows.map((row) => row.length))
  if (maxCols < 1) return null

  const normalizedRows = rows.map((row) => {
    const next = [...row]
    while (next.length < maxCols) next.push("")
    return next
  })

  return {
    rows: normalizedRows.length,
    cols: maxCols,
    content: normalizedRows,
    // Bảng markdown chỉ có header khi dòng phân cách nằm ngay sau dòng đầu tiên
    hasHeader: separatorIndex === 1 && normalizedRows.length > 1,
  }
}

/** Parse bảng phân cách bằng phím Tab (\t) khi copy từ Excel / Google Sheets / Word text */
export function parseTsvTable(lines: string[]): ParsedTableData | null {
  if (!lines || lines.length < 2) return null
  const rows = lines
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t").map((cell) => sanitizeInlineHtml(parseInlineMarkdown(cell.trim()))))

  if (rows.length < 2) return null
  const maxCols = Math.max(...rows.map((r) => r.length))
  if (maxCols < 2) return null

  const normalizedRows = rows.map((row) => {
    const next = [...row]
    while (next.length < maxCols) next.push("")
    return next
  })

  return {
    rows: normalizedRows.length,
    cols: maxCols,
    content: normalizedRows,
    hasHeader: true,
  }
}

/** Parse nội dung markdown / text có cấu trúc (đoạn văn, heading, list, quote, bảng) thành khối. */
export function parseMarkdownToBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  const lines = String(text ?? "").split(/\r?\n/)
  let i = 0

  while (i < lines.length) {
    const rawLine = lines[i]
    const trimmedLine = rawLine.trim()

    if (!trimmedLine) {
      i++
      continue
    }

    // 1. Bảng Markdown (có dấu | ở 2 đầu, hoặc dòng kế tiếp là dòng phân cách |---|)
    const startsAsPipeTable =
      (trimmedLine.startsWith("|") && trimmedLine.endsWith("|")) ||
      (isMarkdownTableRow(trimmedLine) && i + 1 < lines.length && isMarkdownTableSeparator(lines[i + 1]))

    if (startsAsPipeTable) {
      const tableLines: string[] = [trimmedLine]
      i++
      while (i < lines.length) {
        const nextLine = lines[i].trim()
        if (isMarkdownTableRow(nextLine) || isMarkdownTableSeparator(nextLine)) {
          tableLines.push(nextLine)
          i++
        } else if (nextLine === "" && i + 1 < lines.length && isMarkdownTableRow(lines[i + 1].trim())) {
          i++
        } else {
          break
        }
      }

      const tableData = parseMarkdownTable(tableLines)
      if (tableData) {
        blocks.push({ type: "table", text: "", tableData })
        continue
      }
    }

    // 2. Bảng TSV (copy từ Excel / Google Sheets / Word có ký tự \t giữa các cột)
    if (rawLine.includes("\t") && i + 1 < lines.length && lines[i + 1].includes("\t")) {
      const tsvLines: string[] = [rawLine]
      i++
      while (i < lines.length && lines[i].includes("\t")) {
        tsvLines.push(lines[i])
        i++
      }
      const tableData = parseTsvTable(tsvLines)
      if (tableData) {
        blocks.push({ type: "table", text: "", tableData })
        continue
      }
    }

    // 3. Heading (# .. ######)
    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6) as ParsedBlock["level"]
      blocks.push({ type: "heading", text: sanitizeInlineHtml(parseInlineMarkdown(headingMatch[2])), level })
      i++
      continue
    }

    // 4. Blockquote (> ...)
    if (trimmedLine.startsWith(">")) {
      blocks.push({
        type: "quote",
        text: sanitizeInlineHtml(parseInlineMarkdown(trimmedLine.replace(/^>\s*/, ""))),
      })
      i++
      continue
    }

    // 5. List không thứ tự (- , * , + , • , ● , ◦ , ▪ )
    if (/^(?:[*\-+•●◦▪])\s+/.test(trimmedLine)) {
      const items: string[] = []
      while (i < lines.length && /^(?:[*\-+•●◦▪])\s+/.test(lines[i].trim())) {
        items.push(sanitizeInlineHtml(parseInlineMarkdown(lines[i].trim().replace(/^(?:[*\-+•●◦▪])\s+/, ""))))
        i++
      }
      blocks.push({ type: "list", text: "", style: "unordered", items })
      continue
    }

    // 6. List có thứ tự (1. hoặc 1) )
    if (/^\d+[.)]\s+/.test(trimmedLine)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(sanitizeInlineHtml(parseInlineMarkdown(lines[i].trim().replace(/^\d+[.)]\s+/, ""))))
        i++
      }
      blocks.push({ type: "list", text: "", style: "ordered", items })
      continue
    }

    // Đường kẻ ngang -> bỏ qua
    if (/^[-*_]{3,}$/.test(trimmedLine)) {
      i++
      continue
    }

    // Đoạn văn
    blocks.push({
      type: "paragraph",
      text: sanitizeInlineHtml(parseInlineMarkdown(trimmedLine)),
    })
    i++
  }

  return blocks
}

/** Kiểm tra nhanh nội dung có phải markdown / TSV không. */
export function looksLikeMarkdown(content: string): boolean {
  if (!content) return false
  return (
    /^\|.*\|$/m.test(content) ||
    /^\|?[\s\-:|]+\|[\s\-:|]+\|?$/m.test(content) ||
    /^[^\n]+\t[^\n]+\n[^\n]+\t[^\n]+/m.test(content) ||
    /^#{1,6}\s+/m.test(content) ||
    /^[*\-+•●◦▪]\s+/m.test(content) ||
    /^\d+[.)]\s+/m.test(content) ||
    /^>\s+/m.test(content)
  )
}

/**
 * Kiểm tra xem clipboard HTML có chứa cấu trúc HTML thực sự (bảng, heading, list, quote...)
 * từ Google Docs / Word / Excel / Web / Gemini / ChatGPT không.
 * Nếu có thì PHẢI ưu tiên parse HTML thay vì parse plain text (tránh mất bảng `<table>` và định dạng).
 */
export function hasRichHtmlStructure(html: string, plainText = ""): boolean {
  if (!html || typeof html !== "string") return false
  // Nếu plainText thực chất là mã nguồn Markdown thô (có ## hoặc bảng |---|) mà HTML chỉ là thẻ bao đơn giản
  const plainHasRawMarkdown =
    /^#{1,6}\s+/m.test(plainText) ||
    (/^\|.*\|$/m.test(plainText) && !/<table[\s>]/i.test(html))

  if (plainHasRawMarkdown && !/<(table|h[1-6]|ul|ol|blockquote)[\s>]/i.test(html)) {
    return false
  }

  return /<(table|thead|tbody|tr|td|th|h[1-6]|ul|ol|li|blockquote|figure|img|p|div|strong|b|em|i|a)[\s>]/i.test(
    html,
  )
}

/* ------------------------------------------------------------------ */
/* HTML (Google Docs, Word, Excel, Notion, Gemini, Web)                */
/* ------------------------------------------------------------------ */

function ensureDomParser() {
  if (typeof DOMParser === "undefined") {
    throw new Error("DOMParser không khả dụng (hàm parse HTML chỉ dùng ở phía client).")
  }
}

/**
 * Gỡ bỏ thẻ `<b style="font-weight:normal">` đặc trưng của Google Docs
 * (Google Docs luôn bọc toàn bộ nội dung copy trong `<b style="font-weight:normal" id="docs-internal-guid-...">`).
 */
function unwrapGoogleDocsNormalBold(root: ParentNode) {
  root.querySelectorAll("b, strong").forEach((el) => {
    const style = el.getAttribute("style") || ""
    const id = el.getAttribute("id") || ""
    if (/font-weight\s*:\s*(normal|400)\b/i.test(style) || id.startsWith("docs-internal-guid")) {
      const span = el.ownerDocument.createElement("span")
      while (el.firstChild) span.appendChild(el.firstChild)
      el.replaceWith(span)
    }
  })
}

/**
 * Làm sạch HTML inline khi copy từ Google Docs / Word / web:
 * - Gỡ `<b style="font-weight:normal">` của Google Docs
 * - Chuyển `<span style="font-weight:700">` thành `<strong>`, ...
 * - Bỏ toàn bộ attribute lạ, giữ lại href an toàn.
 */
export function cleanInlineHtml(html: string): string {
  if (!html || typeof html !== "string") return ""
  ensureDomParser()

  const temp = document.createElement("div")
  temp.innerHTML = html

  temp
    .querySelectorAll("script, style, meta, link, iframe, object, embed, form, input, button, colgroup, col")
    .forEach((el) => el.remove())

  // Xoá ký tự bullet giả của MS Word (span style="mso-list:Ignore")
  temp.querySelectorAll("span").forEach((span) => {
    const style = span.getAttribute("style") || ""
    if (/mso-list\s*:\s*Ignore/i.test(style)) {
      span.remove()
    }
  })

  // Gỡ <b style="font-weight:normal"> của Google Docs trước khi xóa attribute
  unwrapGoogleDocsNormalBold(temp)

  // span có style -> thẻ semantic
  temp.querySelectorAll("span").forEach((span) => {
    const style = span.getAttribute("style") || ""
    const hasBold = /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)
    const hasItalic = /font-style\s*:\s*italic/i.test(style)
    const hasUnderline = /text-decoration[^;]*underline/i.test(style)

    if (!hasBold && !hasItalic && !hasUnderline) {
      span.replaceWith(...Array.from(span.childNodes))
      return
    }

    let inner = span.innerHTML
    if (hasUnderline) inner = `<u>${inner}</u>`
    if (hasItalic) inner = `<em>${inner}</em>`
    if (hasBold) inner = `<strong>${inner}</strong>`

    const wrapper = document.createElement("span")
    wrapper.innerHTML = inner
    span.replaceWith(...Array.from(wrapper.childNodes))
  })

  // Bỏ thẻ block bao ngoài nhưng giữ nội dung, thêm khoảng trắng để không dính chữ
  temp.querySelectorAll("p, div").forEach((el) => {
    el.replaceWith(...Array.from(el.childNodes), document.createTextNode(" "))
  })

  // Giữ duy nhất href an toàn
  temp.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || ""
    const target = a.getAttribute("target") || ""
    const rel = a.getAttribute("rel") || ""
    while (a.attributes.length > 0) a.removeAttribute(a.attributes[0].name)
    if (href && !/^\s*javascript:/i.test(href)) {
      a.setAttribute("href", href)
      if (target) a.setAttribute("target", target)
      if (rel) a.setAttribute("rel", rel)
    }
  })

  temp.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase()
    if (tag === "a") return
    while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name)
  })

  return sanitizeInlineHtml(temp.innerHTML)
}

function hasBlockChildren(el: Element): boolean {
  return (
    el.querySelector(
      "p, div, section, article, ul, ol, table, blockquote, h1, h2, h3, h4, h5, h6, figure, pre, google-sheets-html-origin",
    ) !== null
  )
}

/** Nhận diện mức Heading từ style của MS Word hoặc Google Docs (khi người viết tô chữ to đậm thay vì chọn thẻ H2/H3) */
function detectImplicitHeadingLevel(el: Element): (1 | 2 | 3 | 4) | null {
  const className = el.getAttribute("class") || ""
  const style = el.getAttribute("style") || ""

  // MS Word: class="MsoHeading2" hoặc style="mso-outline-level:2"
  const msoClassMatch = className.match(/MsoHeading([1-4])/i)
  if (msoClassMatch) return Number(msoClassMatch[1]) as 1 | 2 | 3 | 4

  const msoOutlineMatch = style.match(/mso-outline-level\s*:\s*([1-4])/i)
  if (msoOutlineMatch) return Number(msoOutlineMatch[1]) as 1 | 2 | 3 | 4

  // Kiểm tra trường hợp đoạn văn ngắn (< 150 ký tự) có font-size lớn (>= 14pt hoặc >= 19px) và in đậm
  const plain = (el.textContent || "").trim()
  if (!plain || plain.length > 150) return null

  const combinedStyle = `${style} ${Array.from(el.querySelectorAll("[style]"))
    .map((child) => child.getAttribute("style") || "")
    .join(" ")}`

  const ptMatch = combinedStyle.match(/font-size\s*:\s*([\d.]+)\s*pt/i)
  const pxMatch = combinedStyle.match(/font-size\s*:\s*([\d.]+)\s*px/i)
  const fontSizePt = ptMatch ? parseFloat(ptMatch[1]) : pxMatch ? parseFloat(pxMatch[1]) * 0.75 : 0

  if (fontSizePt >= 18) return 2
  if (fontSizePt >= 14) {
    const isBold =
      /font-weight\s*:\s*(bold|[6-9]00)/i.test(combinedStyle) || el.querySelector("strong, b") !== null
    if (isBold) return 3
  }

  return null
}

/** Nhận diện xem thẻ <p> có phải là 1 mục danh sách từ MS Word (MsoListParagraph) hoặc bắt đầu bằng ký hiệu bullet không */
function detectParagraphListItem(el: Element): { style: "ordered" | "unordered"; html: string } | null {
  const className = el.getAttribute("class") || ""
  const style = el.getAttribute("style") || ""
  const rawText = (el.textContent || "").trim()

  const isMsoList = /MsoListParagraph/i.test(className) || /mso-list\s*:/i.test(style)
  if (isMsoList) {
    const isOrdered = /^\s*\d+[.)]\s*/.test(rawText)
    const cleaned = sanitizeInlineHtml(cleanInlineHtml(el.innerHTML))
      .replace(/^(?:[•●◦▪*\-+]|\d+[.)])\s*/, "")
      .trim()
    if (stripHtml(cleaned)) {
      return { style: isOrdered ? "ordered" : "unordered", html: cleaned }
    }
  }

  // Đoạn văn bắt đầu bằng ký tự chấm tròn Unicode (• , ● , ◦ , ▪ )
  if (/^[•●◦▪]\s+/.test(rawText)) {
    const cleaned = sanitizeInlineHtml(cleanInlineHtml(el.innerHTML))
      .replace(/^[•●◦▪]\s*/, "")
      .trim()
    if (stripHtml(cleaned)) {
      return { style: "unordered", html: cleaned }
    }
  }

  return null
}

/** Parse HTML thành các khối (heading, đoạn, quote, list, table, image). */
export function parseHtmlToParsedBlocks(html: string): ParsedBlock[] {
  if (!html || typeof html !== "string") return []
  ensureDomParser()

  const blocks: ParsedBlock[] = []
  const doc = new DOMParser().parseFromString(html, "text/html")

  // Gỡ bỏ wrapper <b style="font-weight:normal"> của Google Docs trên toàn bộ cây DOM
  unwrapGoogleDocsNormalBold(doc.body)

  const pushParagraph = (rawHtml: string) => {
    const text = sanitizeInlineHtml(cleanInlineHtml(rawHtml))
    const plain = stripHtml(text)
    if (!plain) return

    // Nếu đoạn văn thực chất là một bảng Markdown hoặc tiêu đề Markdown nằm trong thẻ <p>/<div>
    if (looksLikeMarkdown(plain) && (plain.includes("|") || /^#{1,6}\s+/.test(plain))) {
      const mdBlocks = parseMarkdownToBlocks(plain)
      if (mdBlocks.length > 1 || mdBlocks.some((b) => b.type === "table" || b.type === "heading")) {
        blocks.push(...mdBlocks)
        return
      }
    }

    blocks.push({ type: "paragraph", text })
  }

  const pushListItem = (listStyle: "ordered" | "unordered", itemHtml: string) => {
    const prev = blocks[blocks.length - 1]
    if (prev && prev.type === "list" && prev.style === listStyle && Array.isArray(prev.items)) {
      prev.items.push(itemHtml)
    } else {
      blocks.push({
        type: "list",
        text: "",
        style: listStyle,
        items: [itemHtml],
      })
    }
  }

  const processTable = (tableEl: Element) => {
    // Lấy tất cả các hàng <tr> thuộc trực tiếp bảng này (không lấy nhầm <tr> của bảng con lồng bên trong)
    const allTrs = Array.from(tableEl.querySelectorAll("tr")).filter((tr) => tr.closest("table") === tableEl)
    if (allTrs.length === 0) return

    // Nếu là bảng layout 1 hàng x 1 cột bao quanh cả bài viết -> gỡ bảng và đọc các khối bên trong
    if (allTrs.length === 1) {
      const onlyCells = Array.from(allTrs[0].querySelectorAll("td, th")).filter(
        (c) => c.closest("tr") === allTrs[0],
      )
      if (onlyCells.length === 1 && hasBlockChildren(onlyCells[0])) {
        Array.from(onlyCells[0].childNodes).forEach(processNode)
        return
      }
    }

    const rows: string[][] = []

    allTrs.forEach((tr) => {
      const cells: string[] = []
      const cellEls = Array.from(tr.querySelectorAll("td, th")).filter((cell) => cell.closest("tr") === tr)

      cellEls.forEach((cell) => {
        // Nếu trong 1 ô bảng có nhiều thẻ <p> hoặc <li> (rất phổ biến ở Google Docs / Word),
        // nối chúng bằng <br /> trước khi làm sạch để giữ nguyên xuống dòng trong ô
        const clone = cell.cloneNode(true) as Element
        const blockChildren = Array.from(clone.querySelectorAll("p, li, div"))
        if (blockChildren.length > 1) {
          blockChildren.forEach((child, idx) => {
            if (idx < blockChildren.length - 1) {
              child.appendChild(clone.ownerDocument.createElement("br"))
            }
          })
        }

        const cellHtml = clone.textContent?.trim() ? cleanInlineHtml(clone.innerHTML) : ""
        cells.push(cellHtml)

        // Hỗ trợ colspan để không bị lệch cột
        const colspan = Math.min(Math.max(parseInt(cell.getAttribute("colspan") || "1", 10) || 1, 1), 12)
        for (let c = 1; c < colspan; c++) {
          cells.push("")
        }
      })

      // Chỉ thêm hàng nếu có ít nhất 1 ô hoặc có nội dung
      if (cells.length > 0 && cells.some((c) => stripHtml(c).length > 0 || cells.length > 1)) {
        rows.push(cells)
      }
    })

    if (rows.length === 0) return
    const maxCols = Math.max(...rows.map((row) => row.length))
    if (maxCols === 0) return

    const normalized = rows.map((row) => {
      const next = [...row]
      while (next.length < maxCols) next.push("")
      return next
    })

    // Nhận diện hàng tiêu đề (Header row):
    // Google Docs, Word và Excel đều xuất bảng dưới dạng <tbody><tr><td> (không có <thead> hay <th>).
    // Do đó nếu bảng có từ 2 hàng trở lên và có <thead>, <th>, hoặc hàng đầu in đậm / mặc định bảng dữ liệu -> bật hasHeader
    const hasExplicitHeader =
      tableEl.querySelector("thead") !== null ||
      allTrs[0]?.querySelector("th") !== null ||
      allTrs[0]?.querySelector("strong, b") !== null ||
      /font-weight\s*:\s*(bold|[6-9]00)/i.test(allTrs[0]?.innerHTML || "")

    const hasHeader = normalized.length > 1 ? hasExplicitHeader || true : false

    blocks.push({
      type: "table",
      text: "",
      tableData: { rows: normalized.length, cols: maxCols, content: normalized, hasHeader },
    })
  }

  const processImage = (img: Element) => {
    const src = img.getAttribute("src")?.trim() || ""
    if (!src || /^\s*javascript:/i.test(src)) return
    blocks.push({
      type: "image",
      text: "",
      imageData: {
        url: src,
        alt: stripHtml(img.getAttribute("alt") || "").trim(),
        caption: (img.getAttribute("title") || "").trim(),
        width: "100%",
      },
    })
  }

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ""
      if (!text.trim()) return

      // Nếu text node có nhiều dòng (VD: dán plain text hoặc Markdown), tách theo dòng thay vì gộp thành 1 cục
      if (text.includes("\n")) {
        const parsedLines = parseMarkdownToBlocks(text)
        if (parsedLines.length > 0) {
          blocks.push(...parsedLines)
          return
        }
      }

      pushParagraph(text.trim())
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as Element
    const tag = el.tagName.toLowerCase()

    if ( ["script", "style", "meta", "link", "colgroup", "col"].includes(tag) ) {
      return
    }

    // 1. Bảng <table> (ưu tiên kiểm tra trước)
    if (tag === "table") {
      processTable(el)
      return
    }

    // 2. Thẻ Heading H1..H6
    if (HEADING_TAGS.includes(tag)) {
      // Nếu bên trong thẻ heading lại chứa bảng hoặc danh sách (do HTML bẩn) -> tách riêng
      if (el.querySelector("table, ul, ol")) {
        Array.from(el.childNodes).forEach(processNode)
        return
      }
      const text = sanitizeInlineHtml(cleanInlineHtml(el.innerHTML))
      if (stripHtml(text)) {
        blocks.push({ type: "heading", text, level: Number(tag.charAt(1)) as ParsedBlock["level"] })
      }
      return
    }

    // 3. Thẻ <pre> / <code> khối (nếu người dùng copy bảng Markdown hoặc nội dung từ khung code của AI)
    if (tag === "pre") {
      const rawText = el.textContent || ""
      if (looksLikeMarkdown(rawText)) {
        const mdBlocks = parseMarkdownToBlocks(rawText)
        if (mdBlocks.length > 0) {
          blocks.push(...mdBlocks)
          return
        }
      }
      pushParagraph(el.innerHTML)
      return
    }

    // 4. Thẻ <p>
    if (tag === "p") {
      // Nếu trong <p> có chứa <table> (một số trình soạn thảo cũ nhét table trong p)
      if (el.querySelector("table")) {
        Array.from(el.childNodes).forEach(processNode)
        return
      }

      // Nếu trong <p> có ảnh <img>
      const imgs = Array.from(el.querySelectorAll("img"))
      if (imgs.length > 0) {
        imgs.forEach(processImage)
        const clone = el.cloneNode(true) as Element
        clone.querySelectorAll("img").forEach((img) => img.remove())
        if (stripHtml(clone.innerHTML)) {
          pushParagraph(clone.innerHTML)
        }
        return
      }

      // Kiểm tra xem <p> có phải là mục danh sách của MS Word (MsoListParagraph) hoặc bullet • không
      const listItem = detectParagraphListItem(el)
      if (listItem) {
        pushListItem(listItem.style, listItem.html)
        return
      }

      // Kiểm tra xem <p> có phải là Tiêu đề ẩn (chữ to + in đậm từ Google Docs / Word) không
      const implicitLevel = detectImplicitHeadingLevel(el)
      if (implicitLevel) {
        const text = sanitizeInlineHtml(cleanInlineHtml(el.innerHTML))
        if (stripHtml(text)) {
          blocks.push({ type: "heading", text, level: implicitLevel })
          return
        }
      }

      pushParagraph(el.innerHTML)
      return
    }

    // 5. Trích dẫn <blockquote>
    if (tag === "blockquote") {
      if (el.querySelector("table, ul, ol")) {
        Array.from(el.childNodes).forEach(processNode)
        return
      }
      const text = sanitizeInlineHtml(cleanInlineHtml(el.innerHTML))
      if (stripHtml(text)) blocks.push({ type: "quote", text })
      return
    }

    // 6. Hình ảnh <img>
    if (tag === "img") {
      processImage(el)
      return
    }

    // 7. Thẻ <figure> (có thể chứa <img> hoặc <table> trong Notion/WordPress)
    if (tag === "figure") {
      if (el.querySelector("table")) {
        el.querySelectorAll("table").forEach(processTable)
        return
      }
      const imgs = el.querySelectorAll("img")
      const onlyImage = imgs.length > 0 && !hasBlockChildren(el)
      if (onlyImage) {
        imgs.forEach(processImage)
        return
      }
    }

    // 8. Danh sách <ul> / <ol>
    if (tag === "ul" || tag === "ol") {
      const items: string[] = []
      const liElements = Array.from(el.querySelectorAll("li")).filter((li) => li.closest("ul, ol") === el)

      liElements.forEach((li) => {
        // Bỏ danh sách con ra khỏi nội dung item cha để xử lý riêng hoặc giữ gọn
        const clone = li.cloneNode(true) as Element
        const nestedLists = Array.from(clone.querySelectorAll("ul, ol"))
        nestedLists.forEach((nested) => nested.remove())

        const text = sanitizeInlineHtml(cleanInlineHtml(clone.innerHTML))
        if (stripHtml(text)) items.push(text)

        // Nếu có danh sách con lồng bên trong <li>, thêm các mục con vào cùng danh sách
        Array.from(li.querySelectorAll(":scope > ul > li, :scope > ol > li")).forEach((subLi) => {
          const subText = sanitizeInlineHtml(cleanInlineHtml(subLi.innerHTML))
          if (stripHtml(subText)) items.push(`— ${subText}`)
        })
      })

      if (items.length > 0) {
        blocks.push({ type: "list", text: "", style: tag === "ol" ? "ordered" : "unordered", items })
      }
      return
    }

    if (tag === "br" || tag === "hr") return

    if (CONTAINER_TAGS.includes(tag)) {
      if (!hasBlockChildren(el)) {
        pushParagraph(el.innerHTML)
        return
      }
      Array.from(el.childNodes).forEach(processNode)
      return
    }

    // Thẻ inline hoặc thẻ lạ (như <b id="docs-internal-guid-..."> của Google Docs, <span>, <font>)
    // nếu bên trong có chứa thẻ block (table, p, h2, ul...) thì đệ quy vào con
    if (hasBlockChildren(el)) {
      Array.from(el.childNodes).forEach(processNode)
      return
    }

    pushParagraph(el.outerHTML)
  }

  Array.from(doc.body.childNodes).forEach(processNode)

  return blocks
}

/** Chuyển khối đã parse sang cấu trúc Block[] của trình soạn thảo. */
export function parsedBlocksToBlocks(parsed: ParsedBlock[]): Block[] {
  return parsed.map((pb) => {
    switch (pb.type) {
      case "heading":
        return {
          id: generateBlockId(),
          type: "heading",
          data: { text: pb.text, level: pb.level ?? 2, align: "left" },
        }
      case "quote":
        return {
          id: generateBlockId(),
          type: "quote",
          data: { text: pb.text, author: "", align: "left" },
        }
      case "list":
        return {
          id: generateBlockId(),
          type: "list",
          data: { style: pb.style ?? "unordered", items: pb.items ?? [], align: "left" },
        }
      case "table":
        return {
          id: generateBlockId(),
          type: "table",
          data: {
            rows: pb.tableData?.rows ?? 0,
            cols: pb.tableData?.cols ?? 0,
            content: pb.tableData?.content ?? [],
            hasHeader: pb.tableData?.hasHeader ?? true,
            align: "left",
          },
        }
      case "image":
        return {
          id: generateBlockId(),
          type: "image",
          data: {
            url: pb.imageData?.url ?? "",
            alt: pb.imageData?.alt ?? "",
            caption: pb.imageData?.caption ?? "",
            width: pb.imageData?.width ?? "100%",
            align: "center",
          },
        }
      default:
        return {
          id: generateBlockId(),
          type: "paragraph",
          data: { text: pb.text, align: "justify" },
        }
    }
  })
}

/** HTML / Markdown / Text -> Block[] (dùng cho Import và cho các bài viết định dạng cũ). */
export function htmlToBlocks(input: string): Block[] {
  if (!input || typeof input !== "string") return []
  const trimmed = input.trim()
  if (!trimmed) return []

  // Nếu chuỗi không chứa thẻ HTML nào (hoặc là Markdown / TSV thuần) -> dùng bộ parse Markdown/TSV
  const hasHtmlTags = /<\/?[a-z][\s\S]*>/i.test(trimmed)
  if (!hasHtmlTags) {
    const mdBlocks = parseMarkdownToBlocks(trimmed)
    if (mdBlocks.length > 0) return parsedBlocksToBlocks(mdBlocks)
  }

  try {
    const parsed = parseHtmlToParsedBlocks(trimmed)
    if (parsed.length > 0) return parsedBlocksToBlocks(parsed)
  } catch {
    // HTML không parse được: rơi xuống nhánh Markdown/text thuần bên dưới
  }

  // Fallback: parse qua Markdown/text
  const fallbackBlocks = parseMarkdownToBlocks(trimmed)
  if (fallbackBlocks.length > 0) return parsedBlocksToBlocks(fallbackBlocks)

  return parsedBlocksToBlocks(
    trimmed
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ type: "paragraph" as const, text: sanitizeInlineHtml(line) })),
  )
}

/* ------------------------------------------------------------------ */
/* Tiện ích                                                            */
/* ------------------------------------------------------------------ */

/** Text thuần của toàn bộ khối — dùng để đếm từ, tìm kiếm, SEO checker. */
export function blocksToPlainText(blocks: Block[] | undefined | null): string {
  if (!blocks || blocks.length === 0) return ""

  const parts: string[] = []

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "quote":
        parts.push(stripHtml(block.data?.text || ""))
        break
      case "list":
        (block.data?.items || []).forEach((item: string) => parts.push(stripHtml(item)))
        break
      case "table":
        (block.data?.content || []).forEach((row: string[]) =>
          (row || []).forEach((cell) => parts.push(stripHtml(cell))),
        )
        break
      case "image":
        if (block.data?.alt) parts.push(String(block.data.alt))
        if (block.data?.caption) parts.push(String(block.data.caption))
        break
      default:
        break
    }
  }

  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}
