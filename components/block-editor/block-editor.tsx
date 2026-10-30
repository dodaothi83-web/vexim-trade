"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/editor-ui/button"
import {
  Plus,
  GripVertical,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Code,
  Link as LinkIcon,
  Heading2,
  List,
  ListOrdered,
  Image as ImageIcon,
  Table2,
  Quote,
  HelpCircle,
  Loader2,
  Trash2,
  Copy,
  Scissors,
  X,
  Check,
  Wand2,
} from "lucide-react"
import { BlockToolbar } from "./block-toolbar"
import { HeadingBlock } from "./blocks/heading-block"
import { ParagraphBlock } from "./blocks/paragraph-block"
import { ImageBlock } from "./blocks/image-block"
import { QuoteBlock } from "./blocks/quote-block"
import { TableBlock } from "./blocks/table-block"
import { ListBlock } from "./blocks/list-block"
import { InlineToolbar } from "./inline-toolbar"
import { SlashMenu, type SlashMenuItem } from "./slash-menu"
import type { Block, BlockType } from "./types"
import {
  blocksToPlainText,
  generateBlockId,
  hasRichHtmlStructure,
  looksLikeMarkdown,
  parseHtmlToParsedBlocks,
  parseMarkdownToBlocks,
  parsedBlocksToBlocks,
  type ParsedBlock,
} from "@/lib/blog/content-parsers"
import { blocksToHTML } from "@/lib/blocks-to-html"
import { stripHtml } from "@/lib/blog/sanitize"

interface BlockEditorProps {
  value: Block[]
  onChange: (blocks: Block[]) => void
  /** Báo cho trang cha biết khối nào đang được chọn (để chèn gợi ý AI/SEO ngay dưới khối đó) */
  onSelectBlock?: (blockId: string | null) => void
}

const HISTORY_LIMIT = 50
const TYPING_COALESCE_MS = 900

function createDefaultBlock(): Block {
  return {
    id: generateBlockId("block"),
    type: "paragraph",
    data: { text: "", align: "justify" },
  }
}

/** Editor luôn cần ít nhất 1 khối để hiển thị placeholder. */
function normalizeBlocks(value: Block[] | undefined | null): Block[] {
  return value && value.length > 0 ? value : [createDefaultBlock()]
}

function getDefaultBlockData(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "heading":
      return { level: 2, text: "", align: "left" }
    case "paragraph":
      return { text: "", align: "justify" }
    case "image":
      return { url: "", alt: "", caption: "", align: "center", width: "100%" }
    case "quote":
      return { text: "", author: "", align: "left" }
    case "table":
      return { rows: 2, cols: 2, content: [["", ""], ["", ""]], hasHeader: true, align: "left" }
    case "list":
      return { style: "unordered", items: [""], align: "left" }
    default:
      return {}
  }
}

export function BlockEditor({ value, onChange, onSelectBlock }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<Block[]>(() => normalizeBlocks(value))
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [uploadingPastedImage, setUploadingPastedImage] = useState(false)

  /**
   * Tự động chuyển cú pháp Markdown khi gõ (## , - , 1. , > ).
   * Người dùng có thể tắt hẳn (lưu trong localStorage) để gõ được các dòng
   * như "1. Đăng ký cơ sở..." dưới dạng đoạn văn thường.
   */
  const [markdownShortcutsEnabled, setMarkdownShortcutsEnabled] = useState(true)
  /** Thông báo "vừa tự động chuyển khối" để người dùng hoàn tác ngay (giống Word/Google Docs). */
  const [autoConvertNotice, setAutoConvertNotice] = useState<{
    blockId: string
    label: string
    prefix: string
  } | null>(null)
  const autoConvertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Chọn nhiều khối cùng lúc (multi-block selection) kiểu Notion:
   * Ctrl+A hai lần để chọn cả bài, Shift+Click để chọn một khoảng, Delete để xoá sạch.
   */
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([])
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selectionAnchorRef = useRef<string | null>(null)
  const selectAllArmRef = useRef(0)
  const confirmClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Slash Menu / Inline Block Picker state
  const [slashMenuState, setSlashMenuState] = useState<{
    open: boolean
    mode: "slash" | "insert"
    blockId: string | null
    insertPosition: number
    query: string
    position: { top: number; left: number } | null
  }>({
    open: false,
    mode: "insert",
    blockId: null,
    insertPosition: 0,
    query: "",
    position: null,
  })

  // Undo/Redo state for UI buttons
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false })

  /** Nguồn dữ liệu thật của editor (tránh closure cũ trong các handler). */
  const blocksRef = useRef<Block[]>(blocks)
  const onChangeRef = useRef(onChange)
  const onSelectBlockRef = useRef(onSelectBlock)

  // Undo/Redo — lưu bằng ref để không phải stringify lại toàn bộ blocks mỗi lần render
  const historyRef = useRef<Block[][]>([blocks])
  const historyIndexRef = useRef(0)
  const lastPushTimeRef = useRef(0)
  const coalesceKeyRef = useRef<string | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Đọc thiết lập "tự động chuyển Markdown" đã lưu (mặc định: bật)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("vexim:editor-markdown-shortcuts")
      if (saved === "off") setMarkdownShortcutsEnabled(false)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    onSelectBlockRef.current = onSelectBlock
  }, [onSelectBlock])

  const selectBlock = useCallback((id: string | null) => {
    setSelectedBlockId(id)
    onSelectBlockRef.current?.(id)
  }, [])

  const syncHistoryMeta = useCallback(() => {
    setHistoryMeta({
      canUndo: historyIndexRef.current > 0,
      canRedo: historyIndexRef.current < historyRef.current.length - 1,
    })
  }, [])

  /** Thông báo cho component cha mỗi khi nội dung đổi (cha là nguồn dữ liệu khi lưu). */
  useEffect(() => {
    blocksRef.current = blocks
    onChangeRef.current(blocks)
  }, [blocks])

  /**
   * Đồng bộ khi cha đổi `value` từ bên ngoài (Import HTML/Markdown, áp dụng gợi ý AI,
   * khôi phục bản nháp...). Bỏ qua khi `value` chính là mảng do editor vừa phát ra.
   */
  useEffect(() => {
    if (!value) return
    if (value === blocksRef.current) return
    if (value.length === 0 && blocksRef.current.length <= 1) {
      const currentText = String(blocksRef.current[0]?.data?.text ?? "").trim()
      if (!currentText) return
    }
    if (JSON.stringify(value) === JSON.stringify(blocksRef.current)) return

    const next = normalizeBlocks(value)
    blocksRef.current = next
    setBlocks(next)

    historyRef.current = [...historyRef.current.slice(0, historyIndexRef.current + 1), next].slice(-HISTORY_LIMIT)
    historyIndexRef.current = historyRef.current.length - 1
    coalesceKeyRef.current = null
    syncHistoryMeta()
  }, [value, syncHistoryMeta])

  const recordHistory = useCallback(
    (next: Block[], coalesceKey?: string) => {
      const now = Date.now()
      const trimmed = historyRef.current.slice(0, historyIndexRef.current + 1)
      const last = trimmed[trimmed.length - 1]

      if (last && JSON.stringify(last) === JSON.stringify(next)) return

      const canCoalesce =
        !!coalesceKey &&
        coalesceKeyRef.current === coalesceKey &&
        now - lastPushTimeRef.current < TYPING_COALESCE_MS &&
        trimmed.length > 1

      if (canCoalesce) {
        trimmed[trimmed.length - 1] = next
        historyRef.current = trimmed
        lastPushTimeRef.current = now
        syncHistoryMeta()
        return
      }

      coalesceKeyRef.current = coalesceKey ?? null
      lastPushTimeRef.current = now
      const appended = [...trimmed, next]
      historyRef.current = appended.length > HISTORY_LIMIT ? appended.slice(appended.length - HISTORY_LIMIT) : appended
      historyIndexRef.current = historyRef.current.length - 1
      syncHistoryMeta()
    },
    [syncHistoryMeta],
  )

  /** Ghi nội dung mới + lịch sử (dùng cho mọi thao tác của người dùng). */
  const commit = useCallback(
    (next: Block[], coalesceKey?: string) => {
      blocksRef.current = next
      setBlocks(next)
      recordHistory(next, coalesceKey)
    },
    [recordHistory],
  )

  const applyHistoryState = useCallback(
    (state: Block[]) => {
      blocksRef.current = state
      setBlocks(state)
      coalesceKeyRef.current = null
      syncHistoryMeta()
    },
    [syncHistoryMeta],
  )

  const clearAutoConvertNotice = useCallback(() => {
    if (autoConvertTimerRef.current) {
      clearTimeout(autoConvertTimerRef.current)
      autoConvertTimerRef.current = null
    }
    setAutoConvertNotice(null)
  }, [])

  const setMarkdownShortcuts = useCallback(
    (enabled: boolean) => {
      setMarkdownShortcutsEnabled(enabled)
      try {
        window.localStorage.setItem("vexim:editor-markdown-shortcuts", enabled ? "on" : "off")
      } catch {
        /* ignore */
      }
      if (!enabled) clearAutoConvertNotice()
    },
    [clearAutoConvertNotice],
  )

  /**
   * Chuyển khối về đoạn văn thường, khôi phục đúng cú pháp Markdown đã gõ
   * (VD: khối "Danh sách số" [Đăng ký cơ sở] -> đoạn văn "1. Đăng ký cơ sở").
   */
  const undoAutoConvert = useCallback(() => {
    const notice = autoConvertNotice
    if (!notice) return
    const current = blocksRef.current
    const index = current.findIndex((block) => block.id === notice.blockId)
    if (index === -1) {
      clearAutoConvertNotice()
      return
    }
    const block = current[index]

    let plainText = ""
    if (block.type === "list") {
      const items = Array.isArray(block.data?.items) ? (block.data.items as string[]) : []
      const isOrdered = block.data?.style === "ordered"
      plainText = items
        .map((item, itemIndex) => `${isOrdered ? `${itemIndex + 1}. ` : "- "}${item}`)
        .join("<br />")
    } else if (block.type === "heading") {
      const level = Math.min(Math.max(Number(block.data?.level) || 2, 1), 6)
      plainText = `${"#".repeat(level)} ${String(block.data?.text ?? "")}`
    } else if (block.type === "quote") {
      plainText = `> ${String(block.data?.text ?? "")}`
    } else {
      plainText = String(block.data?.text ?? "")
    }

    const next = [...current]
    next[index] = {
      id: block.id,
      type: "paragraph",
      data: { text: plainText, align: "justify" },
    }
    commit(next)
    clearAutoConvertNotice()
    selectBlock(block.id)
    focusBlockAfterRender(block.id, "end")
  }, [autoConvertNotice, commit, clearAutoConvertNotice, selectBlock])

  const undo = useCallback(() => {
    // Vừa tự động chuyển khối (gõ "1. ", "## "...) -> Ctrl+Z hoàn tác riêng bước chuyển
    // đổi đó trước, đúng thói quen của Word / Google Docs.
    if (autoConvertNotice) {
      undoAutoConvert()
      return
    }
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    const previous = historyRef.current[historyIndexRef.current]
    if (previous) applyHistoryState(previous)
  }, [applyHistoryState, autoConvertNotice, undoAutoConvert])

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    const next = historyRef.current[historyIndexRef.current]
    if (next) applyHistoryState(next)
  }, [applyHistoryState])

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const withModifier = e.ctrlKey || e.metaKey
      if (!withModifier) return

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (e.key === "y" || (e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [undo, redo])

  const focusBlockAfterRender = (blockId: string, caretPosition: "start" | "end" = "end") => {
    setTimeout(() => {
      const blockEl = document.querySelector(`[data-block-id="${blockId}"]`)
      if (!blockEl) return
      const editable = blockEl.querySelector("[contenteditable], textarea, input") as HTMLElement | null
      if (!editable) return
      editable.focus()

      if (editable.getAttribute("contenteditable") === "true" && typeof window !== "undefined") {
        try {
          const sel = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(editable)
          range.collapse(caretPosition === "start")
          sel?.removeAllRanges()
          sel?.addRange(range)
        } catch {
          /* ignore */
        }
      }
    }, 30)
  }

  /** Xác định vị trí chèn khối mới: ngay dưới khối đang chọn, hoặc cuối bài */
  const getActiveInsertIndex = (): number => {
    const current = blocksRef.current
    if (!selectedBlockId) return current.length
    const idx = current.findIndex((b) => b.id === selectedBlockId)
    return idx >= 0 ? idx + 1 : current.length
  }

  const addBlock = (type: BlockType, position?: number, customData?: Record<string, unknown>) => {
    const current = blocksRef.current
    const targetPos = typeof position === "number" ? position : getActiveInsertIndex()

    // Nếu khối đang chọn là một đoạn văn trống và người dùng bấm thêm khối mới từ thanh công cụ -> thay thế luôn khối trống đó
    const selectedIdx = selectedBlockId ? current.findIndex((b) => b.id === selectedBlockId) : -1
    const selectedBlock = selectedIdx >= 0 ? current[selectedIdx] : null
    const isSelectedEmptyParagraph =
      selectedBlock &&
      selectedBlock.type === "paragraph" &&
      !stripHtml(String(selectedBlock.data?.text ?? "")).trim() &&
      type !== "paragraph" &&
      position === undefined

    const newBlock: Block = {
      id: generateBlockId("block"),
      type,
      data: customData ? { ...getDefaultBlockData(type), ...customData } : getDefaultBlockData(type),
    }

    const newBlocks = [...current]
    if (isSelectedEmptyParagraph && selectedIdx >= 0) {
      newBlocks.splice(selectedIdx, 1, newBlock)
    } else {
      newBlocks.splice(targetPos, 0, newBlock)
    }

    commit(newBlocks)
    setSlashMenuState((prev) => ({ ...prev, open: false }))
    selectBlock(newBlock.id)
    focusBlockAfterRender(newBlock.id, "start")
  }

  const updateBlock = (id: string, data: Record<string, unknown>) => {
    const next = blocksRef.current.map((block) =>
      block.id === id ? { ...block, data: { ...block.data, ...data } } : block,
    )
    const coalesceKey = typeof data.text === "string" ? `text:${id}` : undefined
    commit(next, coalesceKey)
  }

  const convertBlockType = (
    id: string,
    newType: BlockType,
    newData: Record<string, unknown>,
    meta?: { auto?: boolean; prefix?: string; label?: string },
  ) => {
    commit(blocksRef.current.map((block) => (block.id === id ? { ...block, type: newType, data: newData } : block)))
    selectBlock(id)
    focusBlockAfterRender(id, "end")

    if (meta?.auto) {
      // Hiện thanh nhắc "vừa tự động chuyển" để người dùng hoàn tác hoặc tắt tính năng
      setAutoConvertNotice({ blockId: id, label: meta.label ?? "khối mới", prefix: meta.prefix ?? "" })
      if (autoConvertTimerRef.current) clearTimeout(autoConvertTimerRef.current)
      autoConvertTimerRef.current = setTimeout(() => setAutoConvertNotice(null), 12000)
    }
  }

  const duplicateBlock = (id: string) => {
    const current = blocksRef.current
    const index = current.findIndex((b) => b.id === id)
    if (index === -1) return
    const source = current[index]
    const cloned: Block = {
      id: generateBlockId("block"),
      type: source.type,
      data: JSON.parse(JSON.stringify(source.data)),
    }
    const next = [...current]
    next.splice(index + 1, 0, cloned)
    commit(next)
    selectBlock(cloned.id)
    focusBlockAfterRender(cloned.id, "end")
  }

  const deleteBlock = (id: string) => {
    const current = blocksRef.current

    if (current.length === 1) {
      commit([{ ...current[0], type: "paragraph", data: { text: "", align: "justify" } }])
      focusBlockAfterRender(current[0].id, "start")
      return
    }

    const index = current.findIndex((block) => block.id === id)
    const filtered = current.filter((block) => block.id !== id)
    commit(filtered)

    const targetIndex = Math.max(0, index - 1)
    const targetBlock = filtered[targetIndex]
    if (targetBlock) {
      selectBlock(targetBlock.id)
      focusBlockAfterRender(targetBlock.id, "end")
    } else {
      selectBlock(null)
    }
  }

  /* ============================================================
   * CHỌN NHIỀU KHỐI & XOÁ NHANH (Notion-style)
   * ============================================================ */

  const clearBlockSelection = useCallback(() => {
    setSelectedBlockIds([])
    selectionAnchorRef.current = null
  }, [])

  /** Focus một khối ngay lập tức (không chờ render) — dùng khi cần gõ tiếp sau khi bỏ chọn. */
  const focusBlockNow = useCallback((blockId: string, caret: "start" | "end" = "end") => {
    const blockEl = document.querySelector(`[data-block-id="${blockId}"]`)
    const editable = blockEl?.querySelector("[contenteditable=\"true\"], textarea, input") as HTMLElement | null
    if (!editable) return
    editable.focus()
    if (editable.getAttribute("contenteditable") === "true") {
      try {
        const sel = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(editable)
        range.collapse(caret === "start")
        sel?.removeAllRanges()
        sel?.addRange(range)
      } catch {
        /* ignore */
      }
    }
  }, [])

  /** Chọn toàn bộ khối trong bài (Ctrl+A hai lần hoặc nút "Chọn tất cả"). */
  const selectAllBlocks = useCallback(() => {
    const ids = blocksRef.current.map((block) => block.id)
    if (ids.length === 0) return
    setSelectedBlockIds(ids)
    selectionAnchorRef.current = ids[0]
    selectBlock(null)
    // Bỏ bôi đen chữ trong một khối để nhìn rõ "đang chọn cả bài"
    try {
      window.getSelection()?.removeAllRanges()
    } catch {
      /* ignore */
    }
    containerRef.current?.focus({ preventScroll: true })
  }, [selectBlock])

  /** Shift+Click: chọn từ khối mốc tới khối vừa bấm. */
  const selectRangeTo = useCallback((blockId: string) => {
    const current = blocksRef.current
    const anchorId = selectionAnchorRef.current
    if (!anchorId) {
      selectionAnchorRef.current = blockId
      setSelectedBlockIds([blockId])
      return
    }
    const anchorIndex = current.findIndex((b) => b.id === anchorId)
    const focusIndex = current.findIndex((b) => b.id === blockId)
    if (anchorIndex === -1 || focusIndex === -1) return
    const [start, end] = anchorIndex <= focusIndex ? [anchorIndex, focusIndex] : [focusIndex, anchorIndex]
    setSelectedBlockIds(current.slice(start, end + 1).map((b) => b.id))
    try {
      window.getSelection()?.removeAllRanges()
    } catch {
      /* ignore */
    }
    containerRef.current?.focus({ preventScroll: true })
  }, [])

  const getSelectedBlocks = useCallback((): Block[] => {
    const idSet = new Set(selectedBlockIds)
    return blocksRef.current.filter((block) => idSet.has(block.id))
  }, [selectedBlockIds])

  /** Xoá tất cả khối đang chọn; nếu xoá hết thì để lại 1 đoạn văn trống. */
  const deleteSelectedBlocks = useCallback(() => {
    if (selectedBlockIds.length === 0) return
    const idSet = new Set(selectedBlockIds)
    const current = blocksRef.current
    const firstRemovedIndex = current.findIndex((block) => idSet.has(block.id))
    const remaining = current.filter((block) => !idSet.has(block.id))

    setSelectedBlockIds([])
    selectionAnchorRef.current = null

    if (remaining.length === 0) {
      const fresh = createDefaultBlock()
      commit([fresh])
      selectBlock(fresh.id)
      focusBlockAfterRender(fresh.id, "start")
      return
    }

    const targetIndex = Math.min(Math.max(0, firstRemovedIndex - 1), remaining.length - 1)
    const target = remaining[targetIndex]
    commit(remaining)
    if (target) {
      selectBlock(target.id)
      focusBlockAfterRender(target.id, "end")
    } else {
      selectBlock(null)
    }
  }, [selectedBlockIds, commit, selectBlock])

  /** Xoá sạch toàn bộ nội dung bài viết (vẫn hoàn tác được bằng Ctrl+Z). */
  const clearAllBlocks = useCallback(() => {
    const current = blocksRef.current
    const onlyEmptyParagraph =
      current.length === 1 &&
      current[0].type === "paragraph" &&
      !stripHtml(String(current[0].data?.text ?? "")).trim()
    if (onlyEmptyParagraph) return

    const fresh = createDefaultBlock()
    commit([fresh])
    setSelectedBlockIds([])
    selectionAnchorRef.current = null
    selectBlock(fresh.id)
    focusBlockAfterRender(fresh.id, "start")
  }, [commit, selectBlock])

  const handleClearAllClick = () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true)
      if (confirmClearTimerRef.current) clearTimeout(confirmClearTimerRef.current)
      confirmClearTimerRef.current = setTimeout(() => setConfirmClearAll(false), 4000)
      return
    }
    if (confirmClearTimerRef.current) clearTimeout(confirmClearTimerRef.current)
    setConfirmClearAll(false)
    clearAllBlocks()
  }

  /** Sao chép / Cắt nhiều khối vào clipboard (giữ cả HTML để dán sang nơi khác). */
  const copySelectedBlocks = useCallback(
    async (isCut: boolean) => {
      const selected = getSelectedBlocks()
      if (selected.length === 0) return
      const html = blocksToHTML(selected)
      const text = blocksToPlainText(selected)
      try {
        const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined
        const ClipboardItemCtor = (
          window as unknown as { ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem }
        ).ClipboardItem
        if (clipboard && ClipboardItemCtor) {
          await clipboard.write([
            new ClipboardItemCtor({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([text], { type: "text/plain" }),
            }),
          ])
        } else if (clipboard) {
          await clipboard.writeText(text)
        }
      } catch {
        /* Trình duyệt chặn clipboard → bỏ qua, người dùng vẫn có thể dùng Ctrl+C */
      }
      if (isCut) deleteSelectedBlocks()
    },
    [getSelectedBlocks, deleteSelectedBlocks],
  )

  /**
   * Phím tắt cho vùng chọn nhiều khối (chạy ở capture phase để chặn hành vi
   * Backspace của từng khối khi đang chọn cả bài):
   *  - Ctrl/Cmd+A: lần 1 bôi đen trong khối, lần 2 chọn toàn bộ khối
   *  - Delete / Backspace: xoá mọi khối đang chọn
   *  - Esc: bỏ chọn
   */
  useEffect(() => {
    const handleSelectionKeys = (e: KeyboardEvent) => {
      const container = containerRef.current
      if (!container) return

      const targetEl = e.target as HTMLElement | null
      const activeEl = document.activeElement as HTMLElement | null
      const insideEditor =
        (!!targetEl && container.contains(targetEl)) || (!!activeEl && container.contains(activeEl))
      if (!insideEditor) return

      // Đang gõ trong ô nhập liệu con (alt/caption/nội dung ô bảng dạng input...) → không can thiệp
      const activeTag = activeEl?.tagName
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return

      const withModifier = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (withModifier && !e.shiftKey && !e.altKey && key === "a") {
        const now = Date.now()
        const isSecondPress = now - selectAllArmRef.current < 1500
        const caretInEditable = !!activeEl && activeEl.isContentEditable
        if (!caretInEditable || isSecondPress || selectedBlockIds.length > 0) {
          e.preventDefault()
          e.stopPropagation()
          selectAllBlocks()
        } else {
          // Lần đầu: để trình duyệt bôi đen nội dung khối hiện tại
          selectAllArmRef.current = now
        }
        return
      }

      if (selectedBlockIds.length === 0) return

      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        const firstId = selectedBlockIds[0]
        clearBlockSelection()
        // Trả con trỏ về khối đầu tiên để gõ tiếp ngay, không cần bấm chuột lại
        if (firstId) focusBlockNow(firstId, "end")
        return
      }

      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        e.stopPropagation()
        deleteSelectedBlocks()
        return
      }

      // Gõ ký tự bất kỳ → bỏ chọn và gõ tiếp vào khối cuối cùng đã chọn
      if (!withModifier && !e.altKey && e.key.length === 1) {
        const lastId = selectedBlockIds[selectedBlockIds.length - 1]
        clearBlockSelection()
        if (lastId) focusBlockNow(lastId, "end")
      }
    }

    window.addEventListener("keydown", handleSelectionKeys, true)
    return () => window.removeEventListener("keydown", handleSelectionKeys, true)
  }, [
    selectedBlockIds,
    selectAllBlocks,
    clearBlockSelection,
    deleteSelectedBlocks,
    focusBlockNow,
  ])

  /** Ctrl+C / Ctrl+X khi đang chọn nhiều khối → copy/cut cả cụm khối. */
  const handleCopyOrCut = (e: React.ClipboardEvent<HTMLDivElement>, isCut: boolean) => {
    if (selectedBlockIds.length === 0) return
    const selected = getSelectedBlocks()
    if (selected.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    try {
      e.clipboardData.setData("text/html", blocksToHTML(selected))
      e.clipboardData.setData("text/plain", blocksToPlainText(selected))
    } catch {
      /* ignore */
    }
    if (isCut) deleteSelectedBlocks()
  }

  useEffect(() => {
    return () => {
      if (confirmClearTimerRef.current) clearTimeout(confirmClearTimerRef.current)
      if (autoConvertTimerRef.current) clearTimeout(autoConvertTimerRef.current)
    }
  }, [])

  /** Dọn các id đã chọn nếu khối bị xoá từ nơi khác (undo, import...) */
  useEffect(() => {
    if (selectedBlockIds.length === 0) return
    const existing = new Set(blocks.map((b) => b.id))
    const stillValid = selectedBlockIds.filter((id) => existing.has(id))
    if (stillValid.length !== selectedBlockIds.length) {
      setSelectedBlockIds(stillValid)
      if (stillValid.length === 0) selectionAnchorRef.current = null
    }
  }, [blocks, selectedBlockIds])

  const moveBlock = (id: string, direction: "up" | "down") => {
    const current = blocksRef.current
    const index = current.findIndex((block) => block.id === id)
    if (index === -1) return

    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= current.length) return

    const newBlocks = [...current]
    const [movedBlock] = newBlocks.splice(index, 1)
    newBlocks.splice(newIndex, 0, movedBlock)
    commit(newBlocks)
  }

  const reorderBlocks = (draggedId: string, targetIndex: number) => {
    const current = blocksRef.current
    const draggedIndex = current.findIndex((block) => block.id === draggedId)
    if (draggedIndex === -1 || draggedIndex === targetIndex) return

    const newBlocks = [...current]
    const [draggedBlock] = newBlocks.splice(draggedIndex, 1)
    newBlocks.splice(targetIndex, 0, draggedBlock)
    commit(newBlocks)
  }

  /** Tách đoạn văn tại con trỏ khi nhấn Enter ở giữa câu */
  const handleSplitBlock = (currentBlockId: string, index: number, beforeHtml: string, afterHtml: string) => {
    const current = blocksRef.current
    const currentBlock = current[index]
    if (!currentBlock) return

    const newBlock: Block = {
      id: generateBlockId("block"),
      type: "paragraph",
      data: { text: afterHtml, align: currentBlock.data?.align || "justify" },
    }

    const next = [...current]
    next[index] = { ...currentBlock, data: { ...currentBlock.data, text: beforeHtml } }
    next.splice(index + 1, 0, newBlock)
    commit(next)
    selectBlock(newBlock.id)
    focusBlockAfterRender(newBlock.id, "start")
    void currentBlockId
  }

  /** Gộp đoạn văn hiện tại lên cuối khối phía trên khi nhấn Backspace ở đầu dòng */
  const handleMergeWithPrevious = (currentBlockId: string, index: number, currentHtml: string) => {
    if (index <= 0) return
    const current = blocksRef.current
    const prevBlock = current[index - 1]
    if (!prevBlock) return

    if (prevBlock.type === "paragraph" || prevBlock.type === "heading") {
      const prevHtml = String(prevBlock.data?.text ?? "")
      const mergedHtml = prevHtml && currentHtml ? `${prevHtml} ${currentHtml}` : `${prevHtml}${currentHtml}`
      const next = [...current]
      next[index - 1] = { ...prevBlock, data: { ...prevBlock.data, text: mergedHtml } }
      next.splice(index, 1)
      commit(next)
      selectBlock(prevBlock.id)
      focusBlockAfterRender(prevBlock.id, "end")
    }
    void currentBlockId
  }

  /** Di chuyển con trỏ lên/xuống giữa các khối bằng phím ↑ / ↓ */
  const handleNavigateVertical = (index: number, direction: "up" | "down") => {
    const current = blocksRef.current
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= current.length) return
    const target = current[targetIndex]
    if (!target) return
    selectBlock(target.id)
    focusBlockAfterRender(target.id, direction === "up" ? "end" : "start")
  }

  /** Upload file ảnh khi người dùng Ctrl+V hoặc kéo thả ảnh trực tiếp vào trình soạn thảo */
  const handleUploadAndInsertImage = async (file: File, targetIndex: number, sourceBlockId?: string) => {
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return
    setUploadingPastedImage(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload-image", { method: "POST", body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) return

      const current = blocksRef.current
      const imgBlock: Block = {
        id: generateBlockId("block"),
        type: "image",
        data: { url: data.url, alt: "", caption: "", align: "center", width: "100%" },
      }

      const next = [...current]
      const srcIdx = sourceBlockId ? current.findIndex((b) => b.id === sourceBlockId) : -1
      const srcBlock = srcIdx >= 0 ? current[srcIdx] : null
      const isSourceEmpty =
        srcBlock && srcBlock.type === "paragraph" && !stripHtml(String(srcBlock.data?.text ?? "")).trim()

      if (isSourceEmpty && srcIdx >= 0) {
        next.splice(srcIdx, 1, imgBlock)
      } else {
        next.splice(targetIndex, 0, imgBlock)
      }
      commit(next)
      selectBlock(imgBlock.id)
    } catch {
      // Ảnh dán lỗi: không chèn khối nào, nội dung hiện tại giữ nguyên
      return
    } finally {
      setUploadingPastedImage(false)
    }
  }

  const handleDragStart = (e: React.DragEvent, blockId: string) => {
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", blockId)
    selectBlock(blockId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer?.files || [])
    const imageFile = files.find((f) => f.type.startsWith("image/"))
    if (imageFile) {
      handleUploadAndInsertImage(imageFile, targetIndex + 1)
      return
    }
    const draggedId = e.dataTransfer.getData("text/plain")
    if (draggedId) {
      reorderBlocks(draggedId, targetIndex)
    }
  }

  /** Paste nhiều dòng text thuần -> mỗi dòng một khối đoạn văn. */
  const handlePasteSplit = (currentBlockId: string, index: number, lines: string[]) => {
    const current = blocksRef.current
    const newBlocks = [...current]

    newBlocks[index] = { ...newBlocks[index], data: { ...newBlocks[index].data, text: lines[0] } }

    lines.slice(1).forEach((line, i) => {
      newBlocks.splice(index + 1 + i, 0, {
        id: generateBlockId("block"),
        type: "paragraph",
        data: { text: line, align: "justify" },
      })
    })

    commit(newBlocks)
    void currentBlockId
  }

  /** Paste HTML/Markdown đã được parse thành nhiều khối -> thay khối trống hoặc chèn ngay sau khối hiện tại. */
  const handlePasteBlocks = (currentBlockId: string, parsed: ParsedBlock[]) => {
    const current = blocksRef.current
    const index = current.findIndex((block) => block.id === currentBlockId)
    if (index === -1) return

    const converted = parsedBlocksToBlocks(parsed)
    if (converted.length === 0) return

    const currentBlock = current[index]
    const isCurrentEmpty =
      currentBlock &&
      currentBlock.type === "paragraph" &&
      !stripHtml(String(currentBlock.data?.text ?? "")).trim()

    const newBlocks = [...current]
    if (isCurrentEmpty) {
      newBlocks.splice(index, 1, ...converted)
    } else {
      newBlocks.splice(index + 1, 0, ...converted)
    }
    commit(newBlocks)
    selectBlock(converted[0].id)
  }

  /**
   * Bắt sự kiện Ctrl+V ở cấp toàn trình soạn thảo (phòng trường hợp con trỏ đang đứng ở Heading,
   * Quote hoặc vùng trắng ngoài Paragraph mà người dùng nhấn Ctrl+V để dán cả bài / bảng).
   */
  const handleContainerPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedHTML = e.clipboardData.getData("text/html")
    const pastedText = e.clipboardData.getData("text/plain")

    let parsed: ParsedBlock[] = []
    if (pastedHTML && hasRichHtmlStructure(pastedHTML, pastedText)) {
      try {
        parsed = parseHtmlToParsedBlocks(pastedHTML)
      } catch {
        parsed = []
      }
    }
    if (parsed.length === 0 && pastedText && looksLikeMarkdown(pastedText)) {
      parsed = parseMarkdownToBlocks(pastedText)
    }

    const isStructured =
      parsed.length > 1 || parsed.some((b) => ["table", "image", "list", "heading", "quote"].includes(b.type))

    if (!isStructured) return

    e.preventDefault()
    e.stopPropagation()

    const current = blocksRef.current
    const targetId = selectedBlockId || current[current.length - 1]?.id
    if (targetId) {
      handlePasteBlocks(targetId, parsed)
    }
  }

  /** Khi người dùng chọn một mục từ SlashMenu ("/" hoặc nút "+") */
  const handleSelectSlashItem = (item: SlashMenuItem) => {
    const { mode, blockId, insertPosition } = slashMenuState
    setSlashMenuState((prev) => ({ ...prev, open: false }))

    if (mode === "slash" && blockId) {
      const current = blocksRef.current
      const idx = current.findIndex((b) => b.id === blockId)
      if (idx !== -1) {
        const updated: Block = {
          id: blockId,
          type: item.type,
          data: item.initialData ? { ...item.initialData } : getDefaultBlockData(item.type),
        }
        const next = [...current]
        next.splice(idx, 1, updated)
        commit(next)
        selectBlock(blockId)
        focusBlockAfterRender(blockId, "start")
        return
      }
    }

    addBlock(item.type, insertPosition, item.initialData)
  }

  const openInsertMenuAt = (position: number, triggerEl: HTMLElement) => {
    const rect = triggerEl.getBoundingClientRect()
    setSlashMenuState({
      open: true,
      mode: "insert",
      blockId: null,
      insertPosition: position,
      query: "",
      position: { top: rect.bottom + 6, left: rect.left },
    })
  }

  const renderBlock = (block: Block, index: number) => {
    const isSelected = selectedBlockId === block.id
    const isMultiSelected = selectedBlockIds.includes(block.id)

    return (
      <div
        key={block.id}
        data-block-id={block.id}
        data-multi-selected={isMultiSelected ? "true" : undefined}
        className={`group relative rounded-lg transition-colors px-2 py-1 ${
          isMultiSelected
            ? "bg-primary/[0.09] ring-1 ring-brand-600/40"
            : isSelected
              ? "bg-primary/[0.03] ring-1 ring-brand-600/30"
              : "hover:bg-ink-100/30"
        }`}
        onClick={(e) => {
          e.stopPropagation()
          // Shift+Click: chọn một khoảng khối liên tiếp (giống Notion)
          if (e.shiftKey && (selectionAnchorRef.current || selectedBlockIds.length > 0)) {
            selectRangeTo(block.id)
            return
          }
          if (selectedBlockIds.length > 0) clearBlockSelection()
          selectBlock(block.id)
        }}
        onFocusCapture={() => selectBlock(block.id)}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, index)}
      >
        {/* Nút kéo thả & Thêm khối bên lề trái kiểu Notion */}
        <div className="absolute -left-9 top-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-ink-500 hover:text-ink-900"
            title="Chèn khối bên dưới (hoặc gõ /)"
            onClick={(e) => {
              e.stopPropagation()
              openInsertMenuAt(index + 1, e.currentTarget)
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, block.id)}
            className="cursor-grab active:cursor-grabbing"
            title="Kéo để sắp xếp vị trí khối"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-5 p-0 cursor-grab text-ink-500 hover:text-ink-900"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Khi đang chọn nhiều khối thì ẩn toolbar của từng khối để tránh rối */}
        {isSelected && selectedBlockIds.length === 0 && (
          <BlockToolbar
            block={block}
            onUpdate={(data) => updateBlock(block.id, data)}
            onDelete={() => deleteBlock(block.id)}
            onMoveUp={() => moveBlock(block.id, "up")}
            onMoveDown={() => moveBlock(block.id, "down")}
            onDuplicate={() => duplicateBlock(block.id)}
            onConvertType={(newType, newData) => convertBlockType(block.id, newType, newData)}
          />
        )}

        {/* Block Content */}
        <div className="py-1">
          {block.type === "heading" && (
            <HeadingBlock
              data={block.data}
              onChange={(data) => updateBlock(block.id, data)}
              onEnter={() => addBlock("paragraph", index + 1)}
              onBackspace={() => deleteBlock(block.id)}
              onConvertToParagraph={(currentHtml) =>
                convertBlockType(block.id, "paragraph", { text: currentHtml, align: "justify" })
              }
              onNavigateVertical={(dir) => handleNavigateVertical(index, dir)}
            />
          )}
          {block.type === "paragraph" && (
            <ParagraphBlock
              data={block.data}
              onChange={(data) => updateBlock(block.id, data)}
              onEnter={() => addBlock("paragraph", index + 1)}
              onBackspace={() => deleteBlock(block.id)}
              onPasteSplit={(lines) => handlePasteSplit(block.id, index, lines)}
              onPasteBlocks={(parsedBlocks) => handlePasteBlocks(block.id, parsedBlocks)}
              onSplitBlock={(beforeHtml, afterHtml) => handleSplitBlock(block.id, index, beforeHtml, afterHtml)}
              onMergeWithPrevious={(currentHtml) => handleMergeWithPrevious(block.id, index, currentHtml)}
              onConvertBlock={(newType, newData, meta) => convertBlockType(block.id, newType, newData, meta)}
              markdownShortcutsEnabled={markdownShortcutsEnabled}
              onSlashCommand={(query, rect) => {
                if (query === null) {
                  setSlashMenuState((prev) =>
                    prev.open && prev.mode === "slash" && prev.blockId === block.id ? { ...prev, open: false } : prev,
                  )
                } else {
                  setSlashMenuState({
                    open: true,
                    mode: "slash",
                    blockId: block.id,
                    insertPosition: index,
                    query,
                    position: rect ? { top: rect.bottom + 4, left: rect.left } : null,
                  })
                }
              }}
              onNavigateVertical={(dir) => handleNavigateVertical(index, dir)}
              onPasteImageFile={(file) => handleUploadAndInsertImage(file, index + 1, block.id)}
            />
          )}
          {block.type === "image" && <ImageBlock data={block.data} onChange={(data) => updateBlock(block.id, data)} />}
          {block.type === "quote" && (
            <QuoteBlock
              data={block.data}
              onChange={(data) => updateBlock(block.id, data)}
              onEnter={() => addBlock("paragraph", index + 1)}
              onBackspace={() => deleteBlock(block.id)}
              onNavigateVertical={(dir) => handleNavigateVertical(index, dir)}
            />
          )}
          {block.type === "table" && <TableBlock data={block.data} onChange={(data) => updateBlock(block.id, data)} />}
          {block.type === "list" && (
            <ListBlock
              data={block.data}
              onChange={(data) => updateBlock(block.id, data)}
              onEnter={() => addBlock("paragraph", index + 1)}
              onBackspace={() => deleteBlock(block.id)}
              onNavigateVertical={(dir) => handleNavigateVertical(index, dir)}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="block-editor-container border rounded-xl bg-white min-h-[560px] flex flex-col shadow-xs outline-none"
      onClick={() => {
        selectBlock(null)
        clearBlockSelection()
      }}
      onPaste={handleContainerPaste}
      onCopy={(e) => handleCopyOrCut(e, false)}
      onCut={(e) => handleCopyOrCut(e, true)}
    >
      {/* Thanh công cụ định dạng cố định trên đầu trình soạn thảo (quen thuộc như WordPress / Google Docs) */}
      <div
        className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-1 border-b bg-ink-100/40 backdrop-blur px-3 py-2 rounded-t-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          {/* Undo / Redo */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!historyMeta.canUndo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={undo}
            title="Hoàn tác (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={!historyMeta.canRedo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={redo}
            title="Làm lại (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </Button>

          <div className="w-px h-5 bg-ink-200 mx-1" />

          {/* Định dạng chữ inline (giữ nguyên vùng bôi đen nhờ onMouseDown preventDefault) */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onMouseDown={(e) => {
              e.preventDefault()
              document.execCommand("bold", false)
            }}
            title="In đậm (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onMouseDown={(e) => {
              e.preventDefault()
              document.execCommand("italic", false)
            }}
            title="In nghiêng (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onMouseDown={(e) => {
              e.preventDefault()
              document.execCommand("underline", false)
            }}
            title="Gạch chân (Ctrl+U)"
          >
            <Underline className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onMouseDown={(e) => {
              e.preventDefault()
              document.execCommand("code", false)
            }}
            title="Mã / Thuật ngữ"
          >
            <Code className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs"
            onMouseDown={(e) => {
              e.preventDefault()
              window.dispatchEvent(new CustomEvent("vexim:open-link-toolbar"))
            }}
            title="Chèn Link vào chữ đang bôi đen (Ctrl+K)"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Link</span>
          </Button>

          <div className="w-px h-5 bg-ink-200 mx-1" />

          {/* Nút chèn nhanh các khối phổ biến */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs"
            onClick={() => addBlock("heading", undefined, { level: 2, text: "", align: "left" })}
            title="Chèn Tiêu đề chính H2 (hoặc gõ ## )"
          >
            <Heading2 className="w-4 h-4" />
            <span className="hidden md:inline">H2</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs"
            onClick={() => addBlock("list", undefined, { style: "unordered", items: [""], align: "left" })}
            title="Chèn Danh sách chấm (hoặc gõ - )"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs"
            onClick={() => addBlock("list", undefined, { style: "ordered", items: [""], align: "left" })}
            title="Chèn Danh sách đánh số (hoặc gõ 1. )"
          >
            <ListOrdered className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs"
            onClick={() => addBlock("image")}
            title="Chèn Hình ảnh"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="hidden md:inline">Ảnh</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs"
            onClick={() => addBlock("table")}
            title="Chèn Bảng dữ liệu"
          >
            <Table2 className="w-4 h-4" />
            <span className="hidden md:inline">Bảng</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-xs"
            onClick={() => addBlock("quote")}
            title="Chèn Trích dẫn (hoặc gõ > )"
          >
            <Quote className="w-4 h-4" />
          </Button>
        </div>

        {/* Trạng thái tải ảnh dán & Nút xem mẹo gõ nhanh */}
        <div className="flex items-center gap-2">
          {uploadingPastedImage && (
            <span className="flex items-center gap-1.5 text-xs text-brand-700 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Đang tải ảnh...
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-ink-500 hover:text-ink-900"
            onClick={selectAllBlocks}
            title="Chọn toàn bộ khối trong bài (hoặc bấm Ctrl+A hai lần)"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            Chọn tất cả
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 px-2 text-xs ${
              confirmClearAll
                ? "bg-red-600/10 font-semibold text-red-600 hover:bg-red-600/15 hover:text-red-600"
                : "text-ink-500 hover:text-red-600"
            }`}
            onClick={handleClearAllClick}
            title="Xoá toàn bộ nội dung bài viết (Ctrl+Z để hoàn tác)"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            {confirmClearAll ? "Bấm lần nữa để xoá hết" : "Xoá hết nội dung"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-ink-500 hover:text-ink-900"
            onClick={() => setShowShortcutsHelp((v) => !v)}
          >
            <HelpCircle className="w-3.5 h-3.5 mr-1" />
            Mẹo gõ nhanh
          </Button>
        </div>
      </div>

      {/* Nhắc nhở vừa tự động chuyển khối theo cú pháp Markdown (giống Word / Google Docs) */}
      {autoConvertNotice && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 flex-shrink-0" />
            Đã tự động chuyển thành <strong>{autoConvertNotice.label}</strong> vì bạn gõ cú pháp Markdown.
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 bg-white px-2 text-xs"
              onClick={undoAutoConvert}
              title="Trả khối về đoạn văn thường (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5 mr-1" />
              Hoàn tác chuyển đổi
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-900"
              onClick={() => setMarkdownShortcuts(false)}
              title="Tắt vĩnh viễn việc tự chuyển khi gõ ## , - , 1. , >"
            >
              Tắt tự động chuyển
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-amber-900 hover:bg-amber-100 hover:text-amber-900"
              onClick={clearAutoConvertNotice}
              title="Đóng"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Thanh thao tác khi đang chọn nhiều khối (Notion-style) */}
      {selectedBlockIds.length > 0 && (
        <div
          className="sticky top-[6.4rem] z-10 flex flex-wrap items-center justify-between gap-2 border-b border-brand-700/25 bg-primary/[0.08] px-3 py-1.5 text-xs backdrop-blur"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-1.5 font-semibold text-brand-700">
            <Check className="w-3.5 h-3.5" />
            Đã chọn {selectedBlockIds.length}/{blocks.length} khối
            <span className="hidden font-normal text-ink-500 sm:inline">
              · Shift+Click để chọn thêm · Esc để bỏ chọn
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void copySelectedBlocks(false)}
              title="Sao chép các khối đang chọn (Ctrl+C)"
            >
              <Copy className="w-3.5 h-3.5 mr-1" />
              Sao chép
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => void copySelectedBlocks(true)}
              title="Cắt các khối đang chọn (Ctrl+X)"
            >
              <Scissors className="w-3.5 h-3.5 mr-1" />
              Cắt
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={deleteSelectedBlocks}
              title="Xoá các khối đang chọn (Delete / Backspace)"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Xoá {selectedBlockIds.length} khối
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={clearBlockSelection}
              title="Bỏ chọn (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Bảng hướng dẫn phím tắt kiểu Notion / WordPress */}
      {showShortcutsHelp && (
        <div
          className="border-b bg-blue-50/70 px-4 py-3 text-xs text-blue-950 flex flex-wrap items-center justify-between gap-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">/</kbd> Mở menu chọn khối
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">## Space</kbd> Tiêu đề H2
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">### Space</kbd> Tiêu đề H3
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">- Space</kbd> Danh sách chấm
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">1. Space</kbd> Danh sách số
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">&gt; Space</kbd> Trích dẫn
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">Ctrl+K</kbd> Chèn Link
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">Ctrl+V</kbd> Dán từ Google
              Docs / Ảnh chụp màn hình
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">Ctrl+A ×2</kbd> Chọn toàn bộ
              khối (cả bài)
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">Delete</kbd> Xoá khối đang
              chọn
            </span>
            <span>
              <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px]">Esc</kbd> Bỏ chọn tất cả
            </span>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-blue-600"
              checked={markdownShortcutsEnabled}
              onChange={(e) => setMarkdownShortcuts(e.target.checked)}
            />
            Tự động chuyển khi gõ cú pháp (## , - , 1. , &gt; )
          </label>
          <button
            type="button"
            onClick={() => setShowShortcutsHelp(false)}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Vùng soạn thảo các khối */}
      <div className="flex-1 p-6 pl-12 space-y-2">{blocks.map((block, index) => renderBlock(block, index))}</div>

      {/* Nút thêm khối ở cuối bài */}
      <div className="px-12 pb-6 pt-2" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-ink-500 hover:text-ink-900 border border-dashed border-ink-300 hover:border-ink-400 h-9"
          onClick={(e) => openInsertMenuAt(blocks.length, e.currentTarget)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Thêm khối mới (hoặc gõ phím / trong dòng văn bản)
        </Button>
      </div>

      {/* Menu chọn khối kiểu Notion (Slash Menu & Insert Popover) */}
      <SlashMenu
        open={slashMenuState.open}
        query={slashMenuState.query}
        showSearchInput={slashMenuState.mode === "insert"}
        position={slashMenuState.position}
        onSelect={handleSelectSlashItem}
        onClose={() => setSlashMenuState((prev) => ({ ...prev, open: false }))}
      />

      {/* Thanh định dạng nổi khi bôi đen văn bản */}
      <InlineToolbar onFormat={(command, val) => document.execCommand(command, false, val)} />
    </div>
  )
}
