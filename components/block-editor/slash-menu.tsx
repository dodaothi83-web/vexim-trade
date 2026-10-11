"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Type,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Image as ImageIcon,
  Quote,
  Table2,
  Search,
} from "lucide-react"
import type { BlockType } from "./types"

export interface SlashMenuItem {
  id: string
  type: BlockType
  label: string
  description: string
  shortcut?: string
  keywords: string[]
  icon: React.ComponentType<{ className?: string }>
  initialData?: Record<string, unknown>
}

export const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    id: "paragraph",
    type: "paragraph",
    label: "Đoạn văn",
    description: "Văn bản thông thường",
    keywords: ["p", "paragraph", "doan van", "text", "van ban"],
    icon: Type,
    initialData: { text: "", align: "justify" },
  },
  {
    id: "heading-2",
    type: "heading",
    label: "Tiêu đề chính (H2)",
    description: "Tiêu đề mục lớn, xuất hiện trong Mục lục",
    shortcut: "##",
    keywords: ["h2", "heading 2", "tieu de 2", "muc lon", "title"],
    icon: Heading2,
    initialData: { level: 2, text: "", align: "left" },
  },
  {
    id: "heading-3",
    type: "heading",
    label: "Tiêu đề phụ (H3)",
    description: "Tiêu đề mục con bên trong H2",
    shortcut: "###",
    keywords: ["h3", "heading 3", "tieu de 3", "muc con", "subtitle"],
    icon: Heading3,
    initialData: { level: 3, text: "", align: "left" },
  },
  {
    id: "heading-4",
    type: "heading",
    label: "Tiêu đề nhỏ (H4)",
    description: "Tiêu đề cấp 4 cho ý nhỏ",
    shortcut: "####",
    keywords: ["h4", "heading 4", "tieu de 4"],
    icon: Heading4,
    initialData: { level: 4, text: "", align: "left" },
  },
  {
    id: "list-unordered",
    type: "list",
    label: "Danh sách chấm (•)",
    description: "Danh sách liệt kê bằng dấu chấm tròn",
    shortcut: "- ",
    keywords: ["ul", "bullet", "list", "danh sach", "cham", "liet ke"],
    icon: List,
    initialData: { style: "unordered", items: [""], align: "left" },
  },
  {
    id: "list-ordered",
    type: "list",
    label: "Danh sách đánh số (1. 2. 3.)",
    description: "Danh sách các bước theo thứ tự",
    shortcut: "1.",
    keywords: ["ol", "numbered", "ordered", "list", "danh sach so", "thu tu", "buoc"],
    icon: ListOrdered,
    initialData: { style: "ordered", items: [""], align: "left" },
  },
  {
    id: "image",
    type: "image",
    label: "Hình ảnh",
    description: "Tải ảnh lên, kéo thả hoặc dán URL ảnh",
    keywords: ["img", "image", "hinh anh", "photo", "picture", "anh"],
    icon: ImageIcon,
    initialData: { url: "", alt: "", caption: "", align: "center", width: "100%" },
  },
  {
    id: "table",
    type: "table",
    label: "Bảng dữ liệu",
    description: "Bảng so sánh, hỗ trợ dán trực tiếp từ Excel / Sheets",
    keywords: ["table", "bang", "excel", "grid", "bieu"],
    icon: Table2,
    initialData: { rows: 2, cols: 2, content: [["", ""], ["", ""]], hasHeader: true, align: "left" },
  },
  {
    id: "quote",
    type: "quote",
    label: "Trích dẫn / Lưu ý",
    description: "Làm nổi bật câu trích dẫn hoặc ghi chú quan trọng",
    shortcut: "> ",
    keywords: ["quote", "blockquote", "trich dan", "luu y", "note"],
    icon: Quote,
    initialData: { text: "", author: "", align: "left" },
  },
]

function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
}

interface SlashMenuProps {
  open: boolean
  query?: string
  showSearchInput?: boolean
  onSelect: (item: SlashMenuItem) => void
  onClose: () => void
  position?: { top: number; left: number } | null
}

export function SlashMenu({
  open,
  query: externalQuery = "",
  showSearchInput = false,
  onSelect,
  onClose,
  position,
}: SlashMenuProps) {
  const [internalQuery, setInternalQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const effectiveQuery = showSearchInput ? internalQuery : externalQuery

  const filteredItems = useMemo(() => {
    const q = removeVietnameseTones(effectiveQuery.trim())
    if (!q) return SLASH_MENU_ITEMS

    return SLASH_MENU_ITEMS.filter((item) => {
      const labelMatch = removeVietnameseTones(item.label).includes(q)
      const descMatch = removeVietnameseTones(item.description).includes(q)
      const keywordMatch = item.keywords.some((kw) => removeVietnameseTones(kw).includes(q))
      return labelMatch || descMatch || keywordMatch
    })
  }, [effectiveQuery])

  useEffect(() => {
    setActiveIndex(0)
  }, [effectiveQuery, open])

  useEffect(() => {
    if (open && showSearchInput) {
      setInternalQuery("")
      setTimeout(() => searchInputRef.current?.focus(), 20)
    }
  }, [open, showSearchInput])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((prev) => (filteredItems.length > 0 ? (prev + 1) % filteredItems.length : 0))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        setActiveIndex((prev) =>
          filteredItems.length > 0 ? (prev - 1 + filteredItems.length) % filteredItems.length : 0,
        )
      } else if (e.key === "Enter") {
        if (filteredItems[activeIndex]) {
          e.preventDefault()
          e.stopPropagation()
          onSelect(filteredItems[activeIndex])
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [open, filteredItems, activeIndex, onSelect, onClose])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open, onClose])

  if (!open) return null

  const style: React.CSSProperties = position
    ? {
        position: "fixed",
        top: Math.min(position.top, typeof window !== "undefined" ? window.innerHeight - 360 : position.top),
        left: Math.min(
          Math.max(16, position.left),
          typeof window !== "undefined" ? window.innerWidth - 340 : position.left,
        ),
        zIndex: 60,
      }
    : {}

  return (
    <div
      ref={menuRef}
      style={style}
      className={`${
        position ? "" : "relative z-50"
      } w-80 rounded-xl border bg-white text-ink-900 shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95`}
      onClick={(e) => e.stopPropagation()}
    >
      {showSearchInput ? (
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-ink-100/30">
          <Search className="w-4 h-4 text-ink-500 flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={internalQuery}
            onChange={(e) => setInternalQuery(e.target.value)}
            placeholder="Tìm loại khối (VD: h2, ảnh, bảng...)"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
        </div>
      ) : (
        <div className="flex items-center justify-between border-b px-3 py-1.5 bg-ink-100/30 text-[11px] text-ink-500">
          <span>
            Chèn khối {effectiveQuery ? <strong className="text-ink-900">/{effectiveQuery}</strong> : "(gõ để lọc)"}
          </span>
          <span>↑↓ chọn · Enter</span>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto p-1.5">
        {filteredItems.length === 0 ? (
          <div className="py-6 text-center text-xs text-ink-500">
            Không tìm thấy khối phù hợp với &ldquo;{effectiveQuery}&rdquo;
          </div>
        ) : (
          filteredItems.map((item, idx) => {
            const Icon = item.icon
            const isActive = idx === activeIndex
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(item)
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  isActive ? "bg-brand-700/10 text-brand-700" : "hover:bg-ink-100/60"
                }`}
              >
                <div
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${
                    isActive ? "border-brand-700/30 bg-white text-brand-700" : "bg-ink-100/40 text-ink-500"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium leading-none">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-500">{item.description}</p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
