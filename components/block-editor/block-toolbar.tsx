"use client"

import { Button } from "@/components/editor-ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/editor-ui/select"
import { AlignLeft, AlignCenter, AlignRight, AlignJustify, Trash2, ArrowUp, ArrowDown, Copy } from "lucide-react"
import type { Block } from "./types"

interface BlockToolbarProps {
  block: Block
  onUpdate: (data: any) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate?: () => void
  onConvertType?: (newType: Block["type"], newData: any) => void
}

export function BlockToolbar({
  block,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onConvertType,
}: BlockToolbarProps) {
  const currentAlign = block.data.align || "left"

  const alignments = [
    { value: "left", icon: AlignLeft, label: "Căn trái" },
    { value: "center", icon: AlignCenter, label: "Căn giữa" },
    { value: "right", icon: AlignRight, label: "Căn phải" },
  ]

  if (block.type === "paragraph" || block.type === "list") {
    alignments.push({ value: "justify", icon: AlignJustify, label: "Căn đều" })
  }

  const extractText = (): string => {
    if (typeof block.data.text === "string") return block.data.text
    if (Array.isArray(block.data.items)) return block.data.items.filter(Boolean).join(" ")
    return ""
  }

  const handleTypeChange = (newType: string) => {
    if (!onConvertType) return

    const text = extractText()

    if (newType === "paragraph") {
      onConvertType("paragraph", { text, align: "justify" })
    } else if (newType === "heading-2") {
      onConvertType("heading", { level: 2, text, align: "left" })
    } else if (newType === "heading-3") {
      onConvertType("heading", { level: 3, text, align: "left" })
    } else if (newType === "heading-4") {
      onConvertType("heading", { level: 4, text, align: "left" })
    } else if (newType === "list-unordered") {
      const items = Array.isArray(block.data.items) && block.data.items.length > 0 ? block.data.items : [text]
      onConvertType("list", { style: "unordered", items, align: "left" })
    } else if (newType === "list-ordered") {
      const items = Array.isArray(block.data.items) && block.data.items.length > 0 ? block.data.items : [text]
      onConvertType("list", { style: "ordered", items, align: "left" })
    } else if (newType === "quote") {
      onConvertType("quote", { text, author: block.data.author || "", align: "left" })
    }
  }

  const getCurrentType = () => {
    if (block.type === "paragraph") return "paragraph"
    if (block.type === "heading" && block.data.level === 2) return "heading-2"
    if (block.type === "heading" && block.data.level === 3) return "heading-3"
    if (block.type === "heading" && block.data.level === 4) return "heading-4"
    if (block.type === "list" && block.data.style === "ordered") return "list-ordered"
    if (block.type === "list") return "list-unordered"
    if (block.type === "quote") return "quote"
    return "paragraph"
  }

  const canConvert = ["paragraph", "heading", "list", "quote"].includes(block.type)

  return (
    <div
      className="absolute -top-9 right-2 bg-white/95 backdrop-blur border rounded-lg shadow-md px-1.5 py-1 flex items-center gap-0.5 z-20"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Block Type Converter */}
      {canConvert && onConvertType && (
        <>
          <Select value={getCurrentType()} onValueChange={handleTypeChange}>
            <SelectTrigger className="h-7 w-36 text-xs border-0 bg-ink-100/50 px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paragraph">¶ Đoạn văn</SelectItem>
              <SelectItem value="heading-2">H2 Tiêu đề chính</SelectItem>
              <SelectItem value="heading-3">H3 Tiêu đề phụ</SelectItem>
              <SelectItem value="heading-4">H4 Tiêu đề nhỏ</SelectItem>
              <SelectItem value="list-unordered">• Danh sách chấm</SelectItem>
              <SelectItem value="list-ordered">1. Danh sách số</SelectItem>
              <SelectItem value="quote">&ldquo; Trích dẫn</SelectItem>
            </SelectContent>
          </Select>

          <div className="w-px h-5 bg-ink-200 mx-0.5" />
        </>
      )}

      {/* Alignment */}
      {alignments.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant={currentAlign === value ? "default" : "ghost"}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation()
            onUpdate({ align: value })
          }}
          title={label}
        >
          <Icon className="w-3.5 h-3.5" />
        </Button>
      ))}

      <div className="w-px h-5 bg-ink-200 mx-0.5" />

      {/* Move */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(e) => {
          e.stopPropagation()
          onMoveUp()
        }}
        title="Di chuyển lên"
      >
        <ArrowUp className="w-3.5 h-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={(e) => {
          e.stopPropagation()
          onMoveDown()
        }}
        title="Di chuyển xuống"
      >
        <ArrowDown className="w-3.5 h-3.5" />
      </Button>

      {onDuplicate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          title="Nhân bản khối này"
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
      )}

      <div className="w-px h-5 bg-ink-200 mx-0.5" />

      {/* Delete */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-red-600 hover:text-red-600 hover:bg-red-600/10"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        title="Xóa khối"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}
