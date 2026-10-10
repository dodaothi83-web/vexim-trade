"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/editor-ui/button"
import {
  Bold,
  Italic,
  Underline,
  Link,
  Code,
  Unlink,
  ExternalLink,
  Search,
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Input } from "@/components/editor-ui/input"
import { Label } from "@/components/editor-ui/label"
import { Checkbox } from "@/components/editor-ui/checkbox"

interface LinkOptions {
  url: string
  openInNewTab: boolean
  noFollow: boolean
}

interface PostResult {
  id: string
  title: string
  slug: string
  category?: string
}

interface InlineToolbarProps {
  onFormat: (command: string, value?: string) => void
}

/** Tìm vùng contentEditable chứa một node bất kỳ (ô văn bản của khối). */
function resolveEditable(node: Node | null): HTMLElement | null {
  if (!node) return null
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  return (el?.closest('[contenteditable="true"]') as HTMLElement | null) ?? null
}

/**
 * Khi khối bị re-render (React ghi lại innerHTML sau khi blur) thì Range đã lưu sẽ
 * trỏ vào node đã bị gỡ khỏi DOM. Hàm này dựng lại Range từ chính đoạn text người
 * dùng đã bôi đen, nhờ đó link luôn được gắn đúng chỗ thay vì nhảy về đầu nội dung.
 */
function findTextRange(host: HTMLElement, needle: string): Range | null {
  const target = needle.replace(/\u00A0/g, " ").trim()
  if (!target) return null

  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let full = ""
  let node: Node | null = walker.nextNode()
  while (node) {
    const textNode = node as Text
    nodes.push(textNode)
    full += textNode.data
    node = walker.nextNode()
  }

  const normalizedFull = full.replace(/\u00A0/g, " ")
  const start = normalizedFull.indexOf(target)
  if (start === -1) return null
  const end = start + target.length

  let offset = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0
  for (const textNode of nodes) {
    const length = textNode.data.length
    const nodeStart = offset
    const nodeEnd = offset + length
    if (!startNode && start >= nodeStart && start < nodeEnd) {
      startNode = textNode
      startOffset = start - nodeStart
    }
    if (end > nodeStart && end <= nodeEnd) {
      endNode = textNode
      endOffset = end - nodeStart
      break
    }
    offset = nodeEnd
  }

  if (!startNode || !endNode) return null
  try {
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
  } catch {
    return null
  }
}

/** Bọc nội dung trong Range bằng thẻ <a> (không phụ thuộc execCommand đã bị deprecate). */
function wrapRangeWithLink(range: Range, anchor: HTMLAnchorElement) {
  const contents = range.extractContents()
  anchor.appendChild(contents)
  range.insertNode(anchor)
}

export function InlineToolbar({ onFormat }: InlineToolbarProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkOptions, setLinkOptions] = useState<LinkOptions>({
    url: "",
    openInNewTab: false,
    noFollow: false,
  })
  const [hasExistingLink, setHasExistingLink] = useState(false)
  const [isExternalLink, setIsExternalLink] = useState(false)
  const [linkError, setLinkError] = useState("")
  // Internal post search
  const [showPostSearch, setShowPostSearch] = useState(false)
  const [postQuery, setPostQuery] = useState("")
  const [postResults, setPostResults] = useState<PostResult[]>([])
  const [searchingPosts, setSearchingPosts] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  /** Ô contentEditable chứa vùng bôi đen — phải focus lại trước khi chèn link. */
  const savedEditableRef = useRef<HTMLElement | null>(null)
  /** Đoạn chữ đã bôi đen (dùng để khôi phục Range nếu DOM bị React ghi lại). */
  const savedTextRef = useRef<string>("")
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showLinkInputRef = useRef(false)

  useEffect(() => {
    showLinkInputRef.current = showLinkInput
  }, [showLinkInput])

  // Detect if URL is external
  const checkIfExternal = (url: string) => {
    if (!url) return false
    try {
      const urlObj = new URL(url, window.location.origin)
      return urlObj.hostname !== window.location.hostname
    } catch {
      return false
    }
  }

  const handleLinkClick = useCallback(() => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      savedRangeRef.current = range.cloneRange()
      // Lưu lại ô văn bản + đoạn chữ đang bôi đen để khôi phục chính xác khi bấm "Thêm link"
      savedEditableRef.current = resolveEditable(range.startContainer)
      savedTextRef.current = range.toString()
      setLinkError("")

      const rect = range.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const clampedTop = Math.max(56, rect.top - 48)
        const clampedLeft = Math.min(Math.max(160, rect.left + rect.width / 2), window.innerWidth - 160)
        setPosition({ top: clampedTop, left: clampedLeft })
      }

      const commonAncestor = range.commonAncestorContainer
      let linkElement: HTMLAnchorElement | null = null

      if (commonAncestor.nodeType === Node.ELEMENT_NODE) {
        linkElement = (commonAncestor as HTMLElement).closest("a")
      } else if (commonAncestor.parentElement) {
        linkElement = commonAncestor.parentElement.closest("a")
      }

      if (linkElement) {
        const href = linkElement.getAttribute("href") || linkElement.href
        const isExternal = checkIfExternal(href)
        setLinkOptions({
          url: href,
          openInNewTab: linkElement.target === "_blank",
          noFollow: linkElement.rel?.includes("nofollow") || false,
        })
        setIsExternalLink(isExternal)
        setHasExistingLink(true)
      } else {
        setLinkOptions({
          url: "",
          openInNewTab: false,
          noFollow: false,
        })
        setIsExternalLink(false)
        setHasExistingLink(false)
      }
    }
    setShowLinkInput(true)
  }, [])

  useEffect(() => {
    const handleSelectionChange = () => {
      if (showLinkInputRef.current) {
        return
      }

      const selection = window.getSelection()

      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setPosition(null)
        setShowLinkInput(false)
        return
      }

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      let anchorElement: HTMLElement | null = null
      if (selection.anchorNode) {
        if (selection.anchorNode.nodeType === Node.TEXT_NODE) {
          anchorElement = selection.anchorNode.parentElement
        } else {
          anchorElement = selection.anchorNode as HTMLElement
        }
      }

      if (!anchorElement) {
        setPosition(null)
        return
      }

      const contentEditableParent = anchorElement.closest('[contenteditable="true"]')
      const blockEditorParent = anchorElement.closest(".block-editor-container")

      const isInContentEditable = contentEditableParent !== null || blockEditorParent !== null

      if (!isInContentEditable) {
        setPosition(null)
        return
      }

      if (rect.width === 0 || rect.height === 0) {
        setPosition(null)
        return
      }

      const clampedTop = Math.max(56, rect.top - 48)
      const clampedLeft = Math.min(Math.max(150, rect.left + rect.width / 2), window.innerWidth - 150)

      setPosition({
        top: clampedTop,
        left: clampedLeft,
      })
    }

    // Phím tắt Ctrl+K / Cmd+K để mở nhanh hộp chèn Link khi đang bôi đen văn bản
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
        const anchorNode = selection.anchorNode
        const anchorEl =
          anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : (anchorNode as HTMLElement | null)
        if (!anchorEl?.closest(".block-editor-container")) return
        e.preventDefault()
        handleLinkClick()
      }
    }

    const handleCustomOpenLink = () => {
      handleLinkClick()
    }

    document.addEventListener("selectionchange", handleSelectionChange)
    document.addEventListener("mouseup", handleSelectionChange)
    document.addEventListener("keyup", handleSelectionChange)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("vexim:open-link-toolbar", handleCustomOpenLink)

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      document.removeEventListener("mouseup", handleSelectionChange)
      document.removeEventListener("keyup", handleSelectionChange)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("vexim:open-link-toolbar", handleCustomOpenLink)
    }
  }, [handleLinkClick])

  const handleFormat = (command: string) => {
    onFormat(command)
    setTimeout(() => {
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const clampedTop = Math.max(56, rect.top - 48)
        const clampedLeft = Math.min(Math.max(150, rect.left + rect.width / 2), window.innerWidth - 150)
        setPosition({
          top: clampedTop,
          left: clampedLeft,
        })
      }
    }, 10)
  }

  const handlePostQueryChange = (value: string) => {
    setPostQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)

    if (value.trim().length < 2) {
      setPostResults([])
      setSearchingPosts(false)
      return
    }

    setSearchingPosts(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/blog/search?q=${encodeURIComponent(value.trim())}`)
        const data = await res.json()
        setPostResults(Array.isArray(data?.results) ? data.results : [])
      } catch {
        setPostResults([])
      } finally {
        setSearchingPosts(false)
      }
    }, 300)
  }

  const handleSelectPost = (post: PostResult) => {
    const internalUrl = `/blog/${post.slug}`
    setLinkOptions((prev) => ({ ...prev, url: internalUrl, openInNewTab: false, noFollow: false }))
    setIsExternalLink(false)
    setShowPostSearch(false)
    setPostQuery("")
    setPostResults([])
  }

  const handleUrlChange = (url: string) => {
    const isExternal = checkIfExternal(url)
    setIsExternalLink(isExternal)

    if (isExternal) {
      setLinkOptions((prev) => ({
        ...prev,
        url,
        openInNewTab: true,
        noFollow: prev.noFollow,
      }))
    } else {
      setLinkOptions((prev) => ({
        ...prev,
        url,
        openInNewTab: false,
        noFollow: false,
      }))
    }
  }

  /**
   * Khôi phục vùng bôi đen trước khi chèn link.
   *
   * Vì sao cần: khi bấm nút "Link", ô contentEditable bị blur và React có thể ghi lại
   * `innerHTML` của khối (ListBlock reset innerHTML trong onBlur) → Range đã lưu trỏ vào
   * node đã bị gỡ khỏi DOM. Nếu cứ `addRange(range cũ)` rồi `execCommand("createLink")`
   * thì trình duyệt chèn link ở ĐẦU khối — đúng lỗi "link nhảy về đầu nội dung".
   */
  const restoreRange = useCallback((): Range | null => {
    const host = savedEditableRef.current
    if (!host || !host.isConnected) return null

    const saved = savedRangeRef.current
    // Range hợp lệ = node còn nằm trong DOM và vùng chọn nằm trọn trong khối này
    const isValid =
      !!saved &&
      saved.startContainer.isConnected &&
      saved.endContainer.isConnected &&
      host.contains(saved.startContainer) &&
      host.contains(saved.commonAncestorContainer)

    let range: Range | null = isValid ? saved : null

    // Range cũ đã hỏng (React ghi lại DOM) -> dò lại chính đoạn chữ đã bôi đen trong khối
    if (!range && savedTextRef.current) {
      range = findTextRange(host, savedTextRef.current)
      // Bôi đen qua nhiều khối/dòng: dùng phần text đầu tiên còn nằm trong khối này
      if (!range) {
        for (const line of savedTextRef.current.split(/\r?\n/)) {
          const lineRange = findTextRange(host, line)
          if (lineRange) {
            range = lineRange
            break
          }
        }
      }
    }

    if (!range) return null

    host.focus()
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }
    return range
  }, [])

  const handleLinkSubmit = () => {
    const url = linkOptions.url.trim()
    if (!url) {
      setLinkError("Vui lòng nhập đường dẫn, ví dụ: https://www.access.fda.gov/")
      return
    }

    const host = savedEditableRef.current
    const range = restoreRange()

    if (!host || !range || range.collapsed) {
      setLinkError("Không xác định được đoạn chữ cần gắn link. Hãy bôi đen lại rồi bấm Ctrl+K.")
      return
    }

    // Bọc trực tiếp trong DOM: chính xác vị trí, giữ được target/rel, không phụ thuộc execCommand
    const anchor = document.createElement("a")
    anchor.setAttribute("href", url)
    if (linkOptions.openInNewTab) {
      anchor.setAttribute("target", "_blank")
      const relParts = ["noopener", "noreferrer"]
      if (linkOptions.noFollow) relParts.push("nofollow")
      anchor.setAttribute("rel", relParts.join(" "))
    } else if (linkOptions.noFollow) {
      anchor.setAttribute("rel", "nofollow")
    }

    try {
      wrapRangeWithLink(range, anchor)
    } catch (error) {
      setLinkError("Không chèn được link vào vị trí này. Hãy bôi đen lại trong một dòng rồi thử lại.")
      return
    }

    // Đưa con trỏ ra ngay sau link vừa chèn để gõ tiếp
    try {
      const after = document.createRange()
      after.setStartAfter(anchor)
      after.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(after)
    } catch {
      /* ignore */
    }

    // Báo cho React biết DOM vừa đổi để đồng bộ state của khối (lưu vào blocks)
    host.dispatchEvent(new Event("input", { bubbles: true }))

    savedRangeRef.current = null
    savedEditableRef.current = null
    savedTextRef.current = ""
    resetLinkState()
  }

  const handleRemoveLink = () => {
    const host = savedEditableRef.current
    const range = restoreRange()

    if (!host || !range) {
      setLinkError("Không tìm thấy link để xoá. Hãy bôi đen đoạn chữ chứa link rồi thử lại.")
      return
    }

    const anchors = new Set<HTMLAnchorElement>()
    if (range.collapsed) {
      const node = range.startContainer
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
      const closest = el?.closest("a") as HTMLAnchorElement | null
      if (closest && host.contains(closest)) anchors.add(closest)
    } else {
      host.querySelectorAll("a").forEach((element) => {
        const a = element as HTMLAnchorElement
        try {
          if (range.intersectsNode(a)) anchors.add(a)
        } catch {
          /* ignore */
        }
      })
    }

    if (anchors.size === 0) {
      setLinkError("Đoạn bôi đen không chứa link nào.")
      return
    }

    anchors.forEach((a) => a.replaceWith(...Array.from(a.childNodes)))
    host.dispatchEvent(new Event("input", { bubbles: true }))

    savedRangeRef.current = null
    savedEditableRef.current = null
    savedTextRef.current = ""
    resetLinkState()
  }

  const resetLinkState = () => {
    setShowLinkInput(false)
    setLinkOptions({ url: "", openInNewTab: false, noFollow: false })
    setHasExistingLink(false)
    setIsExternalLink(false)
    setShowPostSearch(false)
    setPostQuery("")
    setPostResults([])
    setLinkError("")
  }

  if (!position) return null

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 bg-white border rounded-lg shadow-xl p-1 flex items-center gap-0.5 animate-in fade-in-0 zoom-in-95"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: "translateX(-50%)",
      }}
    >
      {!showLinkInput ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 bg-transparent"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFormat("bold")}
            title="In đậm (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 bg-transparent"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFormat("italic")}
            title="In nghiêng (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 bg-transparent"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFormat("underline")}
            title="Gạch chân (Ctrl+U)"
          >
            <Underline className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 bg-transparent"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFormat("code")}
            title="Mã / Thuật ngữ"
          >
            <Code className="w-4 h-4" />
          </Button>
          <div className="w-px h-5 bg-ink-200 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 bg-transparent text-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleLinkClick}
            title="Chèn liên kết (Ctrl+K)"
          >
            <Link className="w-3.5 h-3.5" />
            <span>Link</span>
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-2 p-2.5 min-w-[300px]">
          {/* URL Input */}
          <div className="flex items-center gap-2">
            <Input
              type="url"
              placeholder="Dán link (https://...) hoặc chọn bài bên dưới"
              value={linkOptions.url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleLinkSubmit()
                } else if (e.key === "Escape") {
                  resetLinkState()
                }
              }}
              className="h-8 text-sm flex-1"
              autoFocus
            />
            {isExternalLink && (
              <span title="External link" aria-label="External link">
                <ExternalLink className="w-4 h-4 text-blue-500" />
              </span>
            )}
          </div>

          {/* Toggle: chọn bài viết nội bộ */}
          <button
            type="button"
            onClick={() => setShowPostSearch((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-brand-700 hover:underline self-start"
          >
            <Search className="w-3 h-3" />
            {showPostSearch ? "Ẩn tìm bài viết" : "Tìm & liên kết tới bài viết nội bộ"}
          </button>

          {/* Ô tìm kiếm + danh sách bài viết */}
          {showPostSearch && (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-ink-500" />
                <Input
                  type="text"
                  placeholder="Tìm theo tiêu đề bài viết..."
                  value={postQuery}
                  onChange={(e) => handlePostQueryChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") resetLinkState()
                  }}
                  className="h-8 text-sm pl-7"
                  autoFocus
                />
                {searchingPosts && (
                  <Loader2 className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 animate-spin" />
                )}
              </div>

              {postResults.length > 0 && (
                <div className="max-h-44 overflow-y-auto border rounded-md divide-y">
                  {postResults.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => handleSelectPost(post)}
                      className="flex items-start gap-2 w-full text-left px-2 py-1.5 hover:bg-ink-100 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink-500" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-snug line-clamp-2">{post.title}</p>
                        <p className="text-[10px] text-ink-500 truncate">/blog/{post.slug}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!searchingPosts && postQuery.trim().length >= 2 && postResults.length === 0 && (
                <p className="text-xs text-ink-500 px-1">Không tìm thấy bài viết phù hợp.</p>
              )}
            </div>
          )}

          {/* SEO Options */}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="newTab"
                checked={linkOptions.openInNewTab}
                onCheckedChange={(checked) => setLinkOptions((prev) => ({ ...prev, openInNewTab: checked as boolean }))}
              />
              <Label htmlFor="newTab" className="text-xs cursor-pointer">
                Mở tab mới
              </Label>
            </div>

            <div className="flex items-center gap-1.5">
              <Checkbox
                id="noFollow"
                checked={linkOptions.noFollow}
                onCheckedChange={(checked) => setLinkOptions((prev) => ({ ...prev, noFollow: checked as boolean }))}
              />
              <Label htmlFor="noFollow" className="text-xs cursor-pointer" title="Không truyền SEO juice cho link này">
                NoFollow
              </Label>
            </div>
          </div>

          {isExternalLink && (
            <p className="text-xs text-ink-500">
              Link ngoài: Tự động mở tab mới với rel=&quot;noopener noreferrer&quot;
            </p>
          )}

          {linkError && (
            <p className="flex items-start gap-1.5 text-xs text-red-600 leading-snug">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{linkError}</span>
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-7 flex-1" onClick={handleLinkSubmit}>
              {hasExistingLink ? "Cập nhật" : "Thêm link"}
            </Button>
            {hasExistingLink && (
              <Button
                size="sm"
                variant="destructive"
                className="h-7"
                onClick={handleRemoveLink}
                title="Xóa link"
              >
                <Unlink className="w-3 h-3 mr-1" />
                Xóa
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7" onClick={resetLinkState}>
              Hủy
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
