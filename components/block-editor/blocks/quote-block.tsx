"use client"

import React, { useEffect, useRef } from "react"
import { Input } from "@/components/editor-ui/input"
import type { QuoteData } from "../types"
import { sanitizeInlineHtml } from "@/lib/blog/sanitize"

interface QuoteBlockProps {
  data: QuoteData
  onChange: (data: Partial<QuoteData>) => void
  onEnter?: () => void
  onBackspace?: () => void
  onNavigateVertical?: (direction: "up" | "down") => void
}

export function QuoteBlock({ data, onChange, onEnter, onBackspace, onNavigateVertical }: QuoteBlockProps) {
  const { text = "", author = "", align = "left" } = data
  const editorRef = useRef<HTMLParagraphElement>(null)
  const isComposingRef = useRef(false)
  const lastTextRef = useRef(text)

  const alignClass = {
    left: "text-left",
    center: "text-center",
  }[align]

  // Khởi tạo nội dung khi mount (bỏ lỗi chữ placeholder giả "Nhập trích dẫn..." thành chữ thật)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML === "") {
      const cleaned = text === "Nhập trích dẫn..." ? "" : sanitizeInlineHtml(text)
      editorRef.current.innerHTML = cleaned
      lastTextRef.current = cleaned
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Đồng bộ khi nội dung đổi từ bên ngoài (Undo/Redo, AI...)
  useEffect(() => {
    if (text !== lastTextRef.current && editorRef.current && document.activeElement !== editorRef.current) {
      const normalized = text === "Nhập trích dẫn..." ? "" : sanitizeInlineHtml(text)
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLParagraphElement>) => {
    if (e.key === "ArrowUp" && !e.shiftKey && onNavigateVertical) {
      e.preventDefault()
      onNavigateVertical("up")
      return
    }

    if (e.key === "ArrowDown" && !e.shiftKey && onNavigateVertical) {
      e.preventDefault()
      onNavigateVertical("down")
      return
    }

    // Enter (không giữ Shift) -> thoát khối trích dẫn, tạo đoạn văn mới bên dưới
    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault()
      syncFromDom(e.currentTarget.innerHTML)
      onEnter?.()
      return
    }

    // Backspace khi trích dẫn trống -> xóa khối
    if (e.key === "Backspace" && !isComposingRef.current) {
      const currentText = e.currentTarget.textContent?.trim() || ""
      if (!currentText) {
        e.preventDefault()
        onBackspace?.()
      }
    }
  }

  return (
    <blockquote className={`${alignClass} border-l-4 border-brand-700 bg-brand-700/5 rounded-r-lg pl-4 pr-3 py-3 my-2`}>
      <p
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Nhập nội dung trích dẫn hoặc lưu ý quan trọng... (Shift+Enter để xuống dòng, Enter để sang đoạn mới)"
        className="text-lg italic text-ink-800 outline-none min-h-[36px] empty:before:content-[attr(data-placeholder)] empty:before:text-ink-400"
        onKeyDown={handleKeyDown}
        onInput={(e) => {
          if (!isComposingRef.current) syncFromDom(e.currentTarget.innerHTML)
        }}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false
          syncFromDom(e.currentTarget.innerHTML)
        }}
        onBlur={(e) => syncFromDom(e.currentTarget.innerHTML)}
      />
      <footer className="mt-2 flex items-center gap-1.5 text-ink-500">
        <span className="text-sm">—</span>
        <Input
          placeholder="Nguồn / Tác giả (tùy chọn)"
          value={author}
          onChange={(e) => onChange({ author: e.target.value })}
          className="h-7 text-xs italic border-0 bg-transparent shadow-none px-1 focus-visible:ring-1"
        />
      </footer>
    </blockquote>
  )
}
