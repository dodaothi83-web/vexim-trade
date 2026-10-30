"use client"

import React, { useRef, useEffect } from "react"
import type { HeadingData } from "../types"
import { sanitizeInlineHtml } from "@/lib/blog/sanitize"

interface HeadingBlockProps {
  data: HeadingData
  onChange: (data: Partial<HeadingData>) => void
  onEnter?: () => void
  onBackspace?: () => void
  /** Khi nhấn Backspace ở đầu dòng tiêu đề -> chuyển về đoạn văn thường (giữ nguyên chữ) */
  onConvertToParagraph?: (currentHtml: string) => void
  /** Di chuyển lên/xuống giữa các khối bằng phím mũi tên ↑ / ↓ */
  onNavigateVertical?: (direction: "up" | "down") => void
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

export function HeadingBlock({
  data,
  onChange,
  onEnter,
  onBackspace,
  onConvertToParagraph,
  onNavigateVertical,
}: HeadingBlockProps) {
  const { level = 2, text = "", align = "left" } = data

  const editorRef = useRef<HTMLHeadingElement>(null)
  const isComposingRef = useRef(false)
  const lastTextRef = useRef(text)

  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align]

  // Khởi tạo nội dung khi mount giữ định dạng inline (bold/italic/link)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML === "") {
      const initial = sanitizeInlineHtml(text)
      editorRef.current.innerHTML = initial
      lastTextRef.current = initial
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chỉ ghi lại DOM khi nội dung đổi từ bên ngoài (tránh con trỏ nhảy khi đang gõ)
  useEffect(() => {
    if (text !== lastTextRef.current && editorRef.current && document.activeElement !== editorRef.current) {
      const normalized = sanitizeInlineHtml(text)
      editorRef.current.innerHTML = normalized
      lastTextRef.current = normalized
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const syncFromDom = (html?: string) => {
    const sanitized = sanitizeInlineHtml(html ?? editorRef.current?.innerHTML ?? "")
    lastTextRef.current = sanitized
    onChange({ text: sanitized })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLHeadingElement>) => {
    const editor = e.currentTarget

    if (e.key === "ArrowUp" && !e.shiftKey && onNavigateVertical && isCaretAtStart(editor)) {
      e.preventDefault()
      onNavigateVertical("up")
      return
    }

    if (e.key === "ArrowDown" && !e.shiftKey && onNavigateVertical && isCaretAtEnd(editor)) {
      e.preventDefault()
      onNavigateVertical("down")
      return
    }

    // Enter - tạo khối đoạn văn mới bên dưới, giữ nguyên định dạng
    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault()
      syncFromDom(editor.innerHTML)
      onEnter?.()
      return
    }

    // Backspace ở khối rỗng -> xoá khối; ở đầu dòng -> chuyển về đoạn văn thường
    if (e.key === "Backspace" && !isComposingRef.current) {
      const currentText = editor.textContent?.trim() || ""
      if (!currentText) {
        e.preventDefault()
        onBackspace?.()
        return
      }
      if (onConvertToParagraph && isCaretAtStart(editor)) {
        e.preventDefault()
        onConvertToParagraph(sanitizeInlineHtml(editor.innerHTML))
      }
    }
  }

  const handleInput = (e: React.FormEvent<HTMLHeadingElement>) => {
    if (isComposingRef.current) return
    syncFromDom(e.currentTarget.innerHTML)
  }

  const handleCompositionStart = () => {
    isComposingRef.current = true
  }

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLHeadingElement>) => {
    isComposingRef.current = false
    syncFromDom(e.currentTarget.innerHTML)
  }

  const handleBlur = (e: React.FocusEvent<HTMLHeadingElement>) => {
    syncFromDom(e.currentTarget.innerHTML)
  }

  const placeholderText =
    level === 2 ? "Tiêu đề mục chính (H2)..." : level === 3 ? "Tiêu đề mục phụ (H3)..." : "Tiêu đề nhỏ (H4)..."

  const headingProps = {
    ref: editorRef,
    contentEditable: true,
    suppressContentEditableWarning: true,
    className: `flex-1 ${alignClass} ${
      level === 2 ? "text-2xl md:text-3xl" : level === 3 ? "text-xl md:text-2xl" : level === 1 ? "text-3xl md:text-4xl" : "text-lg md:text-xl"
    } font-bold text-brand-700 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-ink-400 empty:before:font-semibold`,
    "data-placeholder": placeholderText,
    onKeyDown: handleKeyDown,
    onInput: handleInput,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onBlur: handleBlur,
  }

  const renderHeading = () => {
    switch (level) {
      case 1:
        return <h1 {...headingProps} />
      case 3:
        return <h3 {...headingProps} />
      case 4:
        return <h4 {...headingProps} />
      case 5:
        return <h5 {...headingProps} />
      case 6:
        return <h6 {...headingProps} />
      default:
        return <h2 {...headingProps} />
    }
  }

  return (
    <div className="group/heading flex items-baseline gap-2 pt-2">
      {renderHeading()}
      {/* Bộ nút chuyển nhanh H2 / H3 / H4 nhỏ gọn, không chiếm dòng riêng */}
      <div className="flex items-center gap-0.5 rounded-md border bg-ink-100/40 p-0.5 opacity-60 group-hover/heading:opacity-100 focus-within:opacity-100 transition-opacity flex-shrink-0">
        {([2, 3, 4] as const).map((lvl) => (
          <button
            key={lvl}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onChange({ level: lvl })
            }}
            className={`px-1.5 py-0.5 text-[11px] font-semibold rounded transition-colors ${
              level === lvl
                ? "bg-brand-700 text-white shadow-sm"
                : "text-ink-500 hover:text-ink-900 hover:bg-white"
            }`}
            title={`Đổi sang Tiêu đề H${lvl}`}
          >
            H{lvl}
          </button>
        ))}
      </div>
    </div>
  )
}
