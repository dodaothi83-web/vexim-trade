"use client"

import React, { useEffect, useRef } from "react"
import type { BlockType, ParagraphData } from "../types"
import {
  cleanInlineHtml,
  hasRichHtmlStructure,
  looksLikeMarkdown,
  parseHtmlToParsedBlocks,
  parseMarkdownToBlocks,
  type ParsedBlock,
} from "@/lib/blog/content-parsers"
import { sanitizeInlineHtml, stripHtml } from "@/lib/blog/sanitize"

interface ParagraphBlockProps {
  data: ParagraphData & { align?: "left" | "center" | "right" | "justify" }
  onChange: (data: Partial<ParagraphData>) => void
  onEnter?: () => void
  onBackspace?: () => void
  onPasteSplit?: (lines: string[]) => void
  onPasteBlocks?: (blocks: ParsedBlock[]) => void
  /** Tách đoạn văn tại vị trí con trỏ khi nhấn Enter ở giữa câu */
  onSplitBlock?: (beforeHtml: string, afterHtml: string) => void
  /** Gộp đoạn văn hiện tại lên cuối khối phía trên khi nhấn Backspace ở đầu dòng */
  onMergeWithPrevious?: (currentHtml: string) => void
  /** Chuyển đổi nhanh loại khối khi gõ cú pháp Markdown (## , - , 1. , > ) */
  onConvertBlock?: (
    type: BlockType,
    data: Record<string, unknown>,
    meta?: { auto?: boolean; prefix?: string; label?: string },
  ) => void
  /**
   * Tự động chuyển cú pháp Markdown khi gõ (## , - , 1. , > ).
   * Tắt để gõ được các dòng như "1. Đăng ký cơ sở..." dưới dạng đoạn văn thường.
   */
  markdownShortcutsEnabled?: boolean
  /** Mở/đóng menu lệnh "/" (Slash Command) kiểu Notion */
  onSlashCommand?: (query: string | null, caretRect?: DOMRect) => void
  /** Di chuyển con trỏ giữa các khối bằng phím mũi tên ↑ / ↓ */
  onNavigateVertical?: (direction: "up" | "down") => void
  /** Dán trực tiếp file ảnh từ clipboard (Ctrl+V ảnh chụp màn hình) */
  onPasteImageFile?: (file: File) => void
}

/** Decode các entity bị mã hoá 2 lần (nội dung cũ trong DB). */
function decodeHtmlEntities(html: string): string {
  if (typeof document === "undefined") return html
  try {
    const temp = document.createElement("textarea")
    temp.innerHTML = html
    return temp.value
  } catch {
    return html
  }
}

function isCaretAtStart(editor: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer)) return false
  try {
    const preRange = document.createRange()
    preRange.selectNodeContents(editor)
    preRange.setEnd(range.startContainer, range.startOffset)
    return preRange.toString().length === 0
  } catch {
    return false
  }
}

function isCaretAtEnd(editor: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.endContainer)) return false
  try {
    const postRange = document.createRange()
    postRange.selectNodeContents(editor)
    postRange.setStart(range.endContainer, range.endOffset)
    return postRange.toString().length === 0
  } catch {
    return false
  }
}

function fragmentToHtml(fragment: DocumentFragment): string {
  const div = document.createElement("div")
  div.appendChild(fragment)
  return sanitizeInlineHtml(div.innerHTML)
}

export function ParagraphBlock({
  data,
  onChange,
  onEnter,
  onBackspace,
  onPasteSplit,
  onPasteBlocks,
  onSplitBlock,
  onMergeWithPrevious,
  onConvertBlock,
  markdownShortcutsEnabled = true,
  onSlashCommand,
  onNavigateVertical,
  onPasteImageFile,
}: ParagraphBlockProps) {
  const { text = "", align = "justify" } = data
  const editorRef = useRef<HTMLParagraphElement>(null)
  const isComposingRef = useRef(false)
  const lastTextRef = useRef(text)

  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
    justify: "text-justify md:text-justify",
  }[align]

  /**
   * Chuẩn hoá nội dung khi nhận từ bên ngoài (load bài / đồng bộ từ cha):
   * decode entity cũ rồi whitelist thẻ inline.
   */
  const normalizeInlineHtml = (html: string): string => {
    if (!html) return ""
    try {
      return sanitizeInlineHtml(decodeHtmlEntities(html))
    } catch {
      return sanitizeInlineHtml(html)
    }
  }

  // Khởi tạo nội dung khi mount - giữ định dạng inline (bold/italic/link)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML === "") {
      const initial = normalizeInlineHtml(text)
      editorRef.current.innerHTML = initial
      lastTextRef.current = initial
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chỉ ghi lại DOM khi nội dung đổi từ bên ngoài (không phải do người dùng đang gõ)
  useEffect(() => {
    const applyExternalText = () => {
      if (text === lastTextRef.current || !editorRef.current) return

      const selection = window.getSelection()
      const isEditorFocused = document.activeElement === editorRef.current

      let savedRange: Range | null = null
      if (isEditorFocused && selection && selection.rangeCount > 0) {
        try {
          savedRange = selection.getRangeAt(0).cloneRange()
        } catch {
          savedRange = null
        }
      }

      const normalized = normalizeInlineHtml(text)
      editorRef.current.innerHTML = normalized
      lastTextRef.current = normalized

      if (savedRange && isEditorFocused && selection) {
        try {
          selection.removeAllRanges()
          selection.addRange(savedRange)
        } catch {
          try {
            const range = document.createRange()
            range.selectNodeContents(editorRef.current)
            range.collapse(false)
            selection.removeAllRanges()
            selection.addRange(range)
          } catch {
            editorRef.current?.focus()
          }
        }
      }
    }

    applyExternalText()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const syncFromDom = (html?: string) => {
    const raw = html ?? editorRef.current?.innerHTML ?? ""
    const sanitized = sanitizeInlineHtml(raw)
    lastTextRef.current = sanitized
    onChange({ text: sanitized })
  }

  /** Kiểm tra cú pháp Markdown ở đầu dòng (VD: "## ", "### ", "- ", "1. ", "> ") */
  const tryMarkdownShortcut = (plainText: string, rawHtml: string): boolean => {
    if (!onConvertBlock || !markdownShortcutsEnabled) return false

    const normalized = plainText.replace(/\u00A0/g, " ")

    /**
     * CHỈ chuyển đổi khi cú pháp vừa được gõ vào một khối còn trống.
     *
     * Trước đây chỉ cần nội dung khối BẮT ĐẦU bằng "1. " là chuyển ngay, nên những
     * đoạn văn đánh số thủ công như "1. Đăng ký cơ sở...", "2. Chỉ định US Agent..."
     * sẽ bị biến thành danh sách ngay khi gõ thêm bất kỳ ký tự nào.
     */
    const prevPlain = stripHtml(lastTextRef.current).replace(/\u00A0/g, " ").trim()
    const isStartingEmpty = prevPlain === "" || /^(#{1,6}|[-*+]|1\.|>)$/.test(prevPlain)
    if (!isStartingEmpty) return false

    // Heading: ## , ### , ####
    const headingMatch = normalized.match(/^(#{2,4})\s(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length as 2 | 3 | 4
      const remainder = headingMatch[2] || ""
      onSlashCommand?.(null)
      onConvertBlock(
        "heading",
        { level, text: sanitizeInlineHtml(remainder), align: "left" },
        { auto: true, prefix: `${"#".repeat(level)} `, label: `Tiêu đề H${level}` },
      )
      return true
    }

    // Bullet list: "- " hoặc "* "
    const ulMatch = normalized.match(/^[-*]\s(.*)$/)
    if (ulMatch) {
      const remainder = ulMatch[1] || ""
      onSlashCommand?.(null)
      onConvertBlock(
        "list",
        { style: "unordered", items: [sanitizeInlineHtml(remainder)], align: "left" },
        { auto: true, prefix: "- ", label: "Danh sách chấm" },
      )
      return true
    }

    // Ordered list: "1. "
    const olMatch = normalized.match(/^1\.\s(.*)$/)
    if (olMatch) {
      const remainder = olMatch[1] || ""
      onSlashCommand?.(null)
      onConvertBlock(
        "list",
        { style: "ordered", items: [sanitizeInlineHtml(remainder)], align: "left" },
        { auto: true, prefix: "1. ", label: "Danh sách số" },
      )
      return true
    }

    // Quote: "> "
    const quoteMatch = normalized.match(/^>\s(.*)$/)
    if (quoteMatch) {
      const remainder = quoteMatch[1] || ""
      onSlashCommand?.(null)
      onConvertBlock(
        "quote",
        { text: sanitizeInlineHtml(remainder), author: "", align: "left" },
        { auto: true, prefix: "> ", label: "Trích dẫn" },
      )
      return true
    }

    void rawHtml
    return false
  }

  /** Kiểm tra lệnh "/" (Slash Command) kiểu Notion */
  const checkSlashCommand = (plainText: string) => {
    if (!onSlashCommand || !editorRef.current) return
    const trimmed = plainText.replace(/\u00A0/g, " ")

    if (/^\/[^\s]*$/.test(trimmed)) {
      const query = trimmed.slice(1)
      const rect = editorRef.current.getBoundingClientRect()
      onSlashCommand(query, rect)
    } else {
      onSlashCommand(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLParagraphElement>) => {
    const editor = e.currentTarget

    // Di chuyển lên khối trên bằng phím ↑ khi con trỏ ở đầu khối
    if (e.key === "ArrowUp" && !e.shiftKey && onNavigateVertical && isCaretAtStart(editor)) {
      e.preventDefault()
      onNavigateVertical("up")
      return
    }

    // Di chuyển xuống khối dưới bằng phím ↓ khi con trỏ ở cuối khối
    if (e.key === "ArrowDown" && !e.shiftKey && onNavigateVertical && isCaretAtEnd(editor)) {
      e.preventDefault()
      onNavigateVertical("down")
      return
    }

    // Enter - tách khối tại vị trí con trỏ hoặc tạo khối đoạn văn mới bên dưới
    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault()

      if (onSplitBlock) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
          try {
            const range = selection.getRangeAt(0)
            const beforeRange = document.createRange()
            beforeRange.selectNodeContents(editor)
            beforeRange.setEnd(range.startContainer, range.startOffset)

            const afterRange = document.createRange()
            afterRange.selectNodeContents(editor)
            afterRange.setStart(range.endContainer, range.endOffset)

            const beforeText = beforeRange.toString()
            const afterText = afterRange.toString()

            if (beforeText.trim().length > 0 && afterText.trim().length > 0) {
              const beforeHtml = fragmentToHtml(beforeRange.cloneContents())
              const afterHtml = fragmentToHtml(afterRange.cloneContents())
              editor.innerHTML = beforeHtml
              lastTextRef.current = beforeHtml
              onSplitBlock(beforeHtml, afterHtml)
              return
            }
          } catch {
            lastTextRef.current = editor.innerHTML
          }
        }
      }

      syncFromDom(editor.innerHTML)
      onEnter?.()
      return
    }

    // Backspace ở khối rỗng -> xoá khối; hoặc ở đầu dòng -> gộp với khối phía trên
    if (e.key === "Backspace" && !isComposingRef.current) {
      const currentText = editor.textContent?.replace(/\u00A0/g, " ").trim() || ""
      if (!currentText) {
        e.preventDefault()
        onSlashCommand?.(null)
        onBackspace?.()
        return
      }

      if (onMergeWithPrevious && isCaretAtStart(editor)) {
        e.preventDefault()
        const currentHtml = sanitizeInlineHtml(editor.innerHTML)
        onMergeWithPrevious(currentHtml)
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLParagraphElement>) => {
    // 0. Nếu clipboard có file hình ảnh (VD: vừa chụp màn hình Ctrl+V) -> tải ảnh lên
    const files = Array.from(e.clipboardData?.files || [])
    const imageFile = files.find((f) => f.type.startsWith("image/"))
    if (imageFile && onPasteImageFile) {
      e.preventDefault()
      e.stopPropagation()
      onPasteImageFile(imageFile)
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const pastedHTML = e.clipboardData.getData("text/html")
    const pastedText = e.clipboardData.getData("text/plain")

    // 1. ƯU TIÊN HTML CÓ CẤU TRÚC từ Google Docs / Word / Excel / Notion / Gemini / Web
    //    (Trước đây kiểm tra looksLikeMarkdown(pastedText) trước nên khi bài có "1. " hoặc "- "
    //    thì toàn bộ thẻ <table>, <h2>, <strong> trong pastedHTML bị vứt bỏ!)
    if (pastedHTML && onPasteBlocks && hasRichHtmlStructure(pastedHTML, pastedText)) {
      try {
        const parsedBlocks = parseHtmlToParsedBlocks(pastedHTML)
        const isStructured =
          parsedBlocks.length > 1 ||
          parsedBlocks.some((block) => ["table", "image", "list", "heading", "quote"].includes(block.type))

        if (isStructured) {
          onPasteBlocks(parsedBlocks)
          return
        }

        // Nếu HTML chỉ ra 1 đoạn văn đơn lẻ và text thuần không phải bảng TSV/Markdown -> chèn inline
        if (parsedBlocks.length === 1 && parsedBlocks[0].type === "paragraph" && !looksLikeMarkdown(pastedText)) {
          insertPasteContent(parsedBlocks[0].text)
          return
        }
      } catch {
        // Không đọc được HTML: dán theo văn bản thuần
        insertPasteContent(pastedText)
        return
      }
    }

    // 2. Markdown hoặc bảng TSV (copy từ Excel/Sheets/Markdown) -> tách thành nhiều khối
    if (pastedText && onPasteBlocks && looksLikeMarkdown(pastedText)) {
      const markdownBlocks = parseMarkdownToBlocks(pastedText)
      const isStructured =
        markdownBlocks.length > 1 ||
        markdownBlocks.some((block) => ["table", "list", "heading", "quote"].includes(block.type))
      if (isStructured) {
        onPasteBlocks(markdownBlocks)
        return
      }
    }

    // 3. Nếu vẫn có pastedHTML (ví dụ 1 câu có in đậm/link) -> chèn inline giữ định dạng
    if (pastedHTML) {
      try {
        const parsedBlocks = parseHtmlToParsedBlocks(pastedHTML)
        if (parsedBlocks.length === 1 && parsedBlocks[0].type === "paragraph") {
          insertPasteContent(parsedBlocks[0].text)
          return
        }
      } catch {
        /* fallback xuống plain text */
      }
    }

    // 4. Text thuần: nhiều dòng -> nhiều khối, một dòng -> chèn tại con trỏ
    const lines = pastedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length > 1 && onPasteSplit) {
      onPasteSplit(lines)
      return
    }

    if (lines.length === 1) {
      insertPasteContent(lines[0])
    }
  }

  /** Chèn nội dung (đã giữ định dạng inline) tại vị trí con trỏ. */
  const insertPasteContent = (content: string) => {
    const editor = editorRef.current
    if (!editor) return

    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(content)
    const html = sanitizeInlineHtml(looksLikeHtml ? cleanInlineHtml(content) : content)

    if (!html) return

    editor.focus()

    const selection = window.getSelection()
    const hasRangeInEditor =
      !!selection &&
      selection.rangeCount > 0 &&
      editor.contains(selection.getRangeAt(0).commonAncestorContainer)

    if (!hasRangeInEditor) {
      syncFromDom(`${editor.innerHTML}${html}`)
      return
    }

    const range = selection!.getRangeAt(0)
    range.deleteContents()

    const temp = document.createElement("div")
    temp.innerHTML = html
    const fragment = document.createDocumentFragment()
    while (temp.firstChild) fragment.appendChild(temp.firstChild)

    range.insertNode(fragment)
    range.collapse(false)
    selection!.removeAllRanges()
    selection!.addRange(range)

    syncFromDom(editor.innerHTML)
  }

  const handleInput = (e: React.FormEvent<HTMLParagraphElement>) => {
    if (isComposingRef.current) return
    const rawHtml = e.currentTarget.innerHTML
    const plainText = e.currentTarget.textContent || ""

    if (tryMarkdownShortcut(plainText, rawHtml)) {
      return
    }

    checkSlashCommand(plainText)

    syncFromDom(rawHtml)
  }

  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLParagraphElement>) => {
    isComposingRef.current = false
    const rawHtml = e.currentTarget.innerHTML
    const plainText = e.currentTarget.textContent || ""
    checkSlashCommand(plainText)
    syncFromDom(rawHtml)
  }

  const handleBlur = (e: React.FocusEvent<HTMLParagraphElement>) => {
    const plain = stripHtml(e.currentTarget.innerHTML).trim()
    if (plain.startsWith("/")) {
      setTimeout(() => onSlashCommand?.(null), 180)
    }
    syncFromDom(e.currentTarget.innerHTML)
  }

  return (
    <p
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      className={`${alignClass} text-base leading-relaxed outline-none min-h-[32px] py-1 resize-none overflow-hidden empty:before:content-[attr(data-placeholder)] empty:before:text-ink-400 prose prose-sm max-w-none [&_a]:text-blue-600 [&_a]:underline [&_a]:cursor-pointer [&_a:hover]:text-blue-800`}
      data-placeholder="Gõ '/' để chọn khối (H2, Ảnh, Bảng, Danh sách...) hoặc nhập nội dung..."
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onInput={handleInput}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onBlur={handleBlur}
    />
  )
}
