"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/editor-ui/button"
import { Plus, Minus, ClipboardPaste, Table2 } from "lucide-react"
import { Checkbox } from "@/components/editor-ui/checkbox"
import { Label } from "@/components/editor-ui/label"
import { Textarea } from "@/components/editor-ui/textarea"
import type { TableData } from "../types"
import {
  cleanInlineHtml,
  parseHtmlToParsedBlocks,
  parseMarkdownTable,
  parseTsvTable,
} from "@/lib/blog/content-parsers"
import { sanitizeInlineHtml } from "@/lib/blog/sanitize"

interface TableBlockProps {
  data: TableData
  onChange: (data: Partial<TableData>) => void
}

/** Decode HTML entities nếu dữ liệu cũ bị escape 2 lần */
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

/**
 * Ô bảng hỗ trợ hiển thị và chỉnh sửa định dạng inline (in đậm, in nghiêng, link, xuống dòng <br />)
 * thay vì <textarea> thô làm lộ thẻ <strong>...</strong> khi dán từ Google Docs / Word / AI.
 */
function RichTableCell({
  value,
  onChange,
  align,
  isHeader,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  align: string
  isHeader?: boolean
  placeholder: string
}) {
  const cellRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const lastValueRef = useRef(value)

  const normalizeCellHtml = (raw: string): string => {
    if (!raw) return ""
    try {
      return sanitizeInlineHtml(decodeHtmlEntities(raw))
    } catch {
      return sanitizeInlineHtml(raw)
    }
  }

  useEffect(() => {
    if (cellRef.current && cellRef.current.innerHTML === "") {
      const normalized = normalizeCellHtml(value)
      cellRef.current.innerHTML = normalized
      lastValueRef.current = normalized
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!cellRef.current) return
    if (value !== lastValueRef.current && document.activeElement !== cellRef.current) {
      const normalized = normalizeCellHtml(value)
      cellRef.current.innerHTML = normalized
      lastValueRef.current = normalized
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const syncFromDom = (rawHtml?: string) => {
    const html = sanitizeInlineHtml(rawHtml ?? cellRef.current?.innerHTML ?? "")
    lastValueRef.current = html
    onChange(html)
  }

  return (
    <div
      ref={cellRef}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={`${align} w-full min-h-[26px] outline-none bg-transparent leading-relaxed text-sm empty:before:content-[attr(data-placeholder)] empty:before:text-ink-400 empty:before:font-normal [&_a]:text-blue-600 [&_a]:underline ${
        isHeader ? "font-semibold text-brand-700" : "text-ink-900"
      }`}
      onInput={(e) => {
        if (!isComposingRef.current) {
          syncFromDom(e.currentTarget.innerHTML)
        }
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
  )
}

export function TableBlock({ data, onChange }: TableBlockProps) {
  const rawContent = Array.isArray(data.content) && data.content.length > 0 ? data.content : [["", ""], ["", ""]]
  const rows = rawContent.length
  const cols = Math.max(data.cols || 0, ...rawContent.map((r) => (Array.isArray(r) ? r.length : 0)), 1)
  const hasHeader = data.hasHeader !== false
  const align = data.align || "left"

  // Chuẩn hoá số cột của mọi hàng để không bị lệch ô
  const content = rawContent.map((row) => {
    const next = Array.isArray(row) ? [...row] : []
    while (next.length < cols) next.push("")
    return next
  })

  const [showPasteDialog, setShowPasteDialog] = useState(false)
  const [pasteText, setPasteText] = useState("")

  const addRow = () => {
    const newContent = [...content, new Array(cols).fill("")]
    onChange({ rows: rows + 1, cols, content: newContent })
  }

  const addCol = () => {
    const newContent = content.map((row) => [...row, ""])
    onChange({ rows, cols: cols + 1, content: newContent })
  }

  const removeRow = () => {
    if (rows <= 1) return
    const newContent = content.slice(0, -1)
    onChange({ rows: rows - 1, cols, content: newContent })
  }

  const removeCol = () => {
    if (cols <= 1) return
    const newContent = content.map((row) => row.slice(0, -1))
    onChange({ rows, cols: cols - 1, content: newContent })
  }

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    const newContent = content.map((row, rIdx) =>
      rIdx === rowIndex ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell)) : row,
    )
    onChange({ rows: newContent.length, cols, content: newContent })
  }

  /** Phân tích dữ liệu bảng từ HTML (Excel/Sheets/Word/Google Docs) hoặc Markdown/TSV */
  const applyParsedTableFromInput = (rawText: string, rawHtml = ""): boolean => {
    // 1. Nếu có thẻ <table> trong HTML
    if (rawHtml && /<table[\s>]/i.test(rawHtml)) {
      try {
        const parsedBlocks = parseHtmlToParsedBlocks(rawHtml)
        const tableBlock = parsedBlocks.find((b) => b.type === "table" && b.tableData)
        if (tableBlock?.tableData) {
          onChange({
            rows: tableBlock.tableData.rows,
            cols: tableBlock.tableData.cols,
            content: tableBlock.tableData.content,
            hasHeader: tableBlock.tableData.hasHeader,
          })
          return true
        }
      } catch {
        return false
      }
    }

    const trimmed = rawText.trim()
    if (!trimmed) return false
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0)

    // 2. Bảng Markdown (| col1 | col2 |)
    if (lines.length >= 2 && lines.some((l) => l.includes("|"))) {
      const mdTable = parseMarkdownTable(lines)
      if (mdTable && mdTable.cols >= 2) {
        onChange({
          rows: mdTable.rows,
          cols: mdTable.cols,
          content: mdTable.content,
          hasHeader: mdTable.hasHeader,
        })
        return true
      }
    }

    // 3. Bảng TSV (phân cách bằng Tab \t từ Excel / Google Sheets)
    if (lines.some((l) => l.includes("\t"))) {
      const tsvTable = parseTsvTable(lines)
      if (tsvTable) {
        onChange({
          rows: tsvTable.rows,
          cols: tsvTable.cols,
          content: tsvTable.content,
          hasHeader: true,
        })
        return true
      }
    }

    // 4. Bảng phân cách bằng >= 2 khoảng trắng liên tiếp
    if (lines.length >= 2 && lines.some((l) => /  +/.test(l))) {
      const parsedContent = lines.map((line) =>
        line.split(/\t|(?:  +)/).map((cell) => sanitizeInlineHtml(cell.trim())),
      )
      const maxCols = Math.max(...parsedContent.map((row) => row.length))
      if (maxCols >= 2) {
        const normalizedContent = parsedContent.map((row) => {
          const next = [...row]
          while (next.length < maxCols) next.push("")
          return next
        })
        onChange({
          rows: normalizedContent.length,
          cols: maxCols,
          content: normalizedContent,
          hasHeader: true,
        })
        return true
      }
    }

    return false
  }

  const handlePasteDialogSubmit = () => {
    if (!pasteText.trim()) return
    const applied = applyParsedTableFromInput(pasteText)
    if (applied) {
      setShowPasteDialog(false)
      setPasteText("")
    }
  }

  // Khi dán trực tiếp vào bảng: chỉ thay cả bảng nếu dữ liệu dán thực sự là cấu trúc bảng nhiều cột
  const handleTablePaste = (e: React.ClipboardEvent) => {
    const html = e.clipboardData.getData("text/html")
    const text = e.clipboardData.getData("text/plain")

    const isMultiCellTable =
      /<table[\s>]/i.test(html) ||
      text.includes("\t") ||
      (text.includes("|") && text.includes("\n"))

    if (isMultiCellTable) {
      const applied = applyParsedTableFromInput(text, html)
      if (applied) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    // Nếu chỉ dán văn bản thường vào 1 ô đang chọn -> chèn văn bản đã làm sạch vào đúng ô đó
    if (html || text) {
      e.preventDefault()
      e.stopPropagation()
      const clean = html ? sanitizeInlineHtml(cleanInlineHtml(html)) : sanitizeInlineHtml(text)
      document.execCommand("insertHTML", false, clean)
    }
  }

  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align]

  return (
    <div className="space-y-2.5 my-2" onPaste={handleTablePaste}>
      {/* Thanh điều khiển bảng gọn gàng */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-ink-100/30 px-3 py-1.5 rounded-lg border">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={addRow}>
            <Plus className="w-3 h-3 mr-1" />
            Thêm hàng
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={removeRow}
            disabled={rows <= 1}
          >
            <Minus className="w-3 h-3 mr-1" />
            Xóa hàng
          </Button>
          <div className="w-px h-4 bg-ink-200 mx-0.5" />
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" onClick={addCol}>
            <Plus className="w-3 h-3 mr-1" />
            Thêm cột
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={removeCol}
            disabled={cols <= 1}
          >
            <Minus className="w-3 h-3 mr-1" />
            Xóa cột
          </Button>
          <div className="w-px h-4 bg-ink-200 mx-0.5" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setShowPasteDialog(!showPasteDialog)}
            title="Dán bảng từ Excel, Word, Google Sheets, Gemini"
          >
            <ClipboardPaste className="w-3 h-3 mr-1" />
            Dán dữ liệu bảng
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          <Checkbox
            id="hasHeader"
            checked={hasHeader}
            onCheckedChange={(checked) => onChange({ hasHeader: checked as boolean })}
          />
          <Label htmlFor="hasHeader" className="text-xs cursor-pointer text-ink-500">
            Hàng đầu là tiêu đề
          </Label>
        </div>
      </div>

      {/* Hộp thoại dán bảng nhanh */}
      {showPasteDialog && (
        <div className="p-3 border rounded-lg bg-ink-100/30 space-y-2">
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <Table2 className="w-4 h-4 text-brand-700" />
            <span>
              Dán bảng từ <strong>Excel, Google Sheets, Word, Google Docs</strong> hoặc bảng{" "}
              <strong>Markdown (| Cột 1 | Cột 2 |)</strong>:
            </span>
          </div>
          <Textarea
            placeholder="Nhấn Ctrl+V để dán bảng vào đây..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={(e) => {
              const html = e.clipboardData.getData("text/html")
              const text = e.clipboardData.getData("text/plain")
              if (applyParsedTableFromInput(text, html)) {
                e.preventDefault()
                setShowPasteDialog(false)
                setPasteText("")
              }
            }}
            rows={4}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs" onClick={handlePasteDialogSubmit} disabled={!pasteText.trim()}>
              Áp dụng
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setShowPasteDialog(false)
                setPasteText("")
              }}
            >
              Hủy
            </Button>
          </div>
        </div>
      )}

      {/* Bảng hiển thị chuẩn xác như bài thật */}
      <div className="overflow-x-auto border border-ink-200 rounded-lg shadow-2xs bg-white">
        <table className="border-collapse w-full table-auto">
          {hasHeader && content.length > 0 && (
            <thead>
              <tr className="bg-ink-100/70 border-b border-ink-200">
                {content[0].map((cell, colIndex) => (
                  <th
                    key={colIndex}
                    className="border-r border-ink-200 last:border-r-0 px-3.5 py-2.5 align-top min-w-[120px]"
                    scope="col"
                  >
                    <RichTableCell
                      value={cell}
                      onChange={(value) => updateCell(0, colIndex, value)}
                      align={alignClass}
                      isHeader
                      placeholder={`Tiêu đề cột ${colIndex + 1}`}
                    />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {content.slice(hasHeader ? 1 : 0).map((row, rowIndex) => {
              const actualRowIndex = hasHeader ? rowIndex + 1 : rowIndex
              return (
                <tr
                  key={actualRowIndex}
                  className="border-b border-ink-200 last:border-b-0 even:bg-ink-100/15 hover:bg-ink-100/30 transition-colors"
                >
                  {row.map((cell, colIndex) => (
                    <td
                      key={colIndex}
                      className="border-r border-ink-200 last:border-r-0 px-3.5 py-2.5 align-top min-w-[120px]"
                    >
                      <RichTableCell
                        value={cell}
                        onChange={(value) => updateCell(actualRowIndex, colIndex, value)}
                        align={alignClass}
                        placeholder="Nhập nội dung..."
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
