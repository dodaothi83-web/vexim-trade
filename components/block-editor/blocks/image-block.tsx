"use client"

import React, { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/editor-ui/button"
import { Input } from "@/components/editor-ui/input"
import { Label } from "@/components/editor-ui/label"
import { Upload, AlertTriangle, Loader2, ImageIcon } from "lucide-react"
import type { ImageData } from "../types"
import { useImageDimensions } from "@/hooks/use-image-dimensions"

interface ImageBlockProps {
  data: ImageData
  onChange: (data: Partial<ImageData>) => void
}

export function ImageBlock({ data, onChange }: ImageBlockProps) {
  const { url = "", alt = "", caption = "", align = "center", width = "100%", width_px, height_px } = data
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [urlDraft, setUrlDraft] = useState("")
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Đo kích thước thật để (a) lưu width/height chống nhảy layout, (b) cảnh báo ảnh quá nhỏ
  const dimensions = useImageDimensions(url)

  useEffect(() => {
    if (!dimensions) return
    const currentWidth = Number(width_px) || 0
    const currentHeight = Number(height_px) || 0
    if (currentWidth === dimensions.width && currentHeight === dimensions.height) return
    onChange({ width_px: dimensions.width, height_px: dimensions.height })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions?.width, dimensions?.height])

  const uploadFile = async (file: File) => {
    setUploadError(null)

    if (!file.type.startsWith("image/")) {
      setUploadError("Vui lòng chọn file hình ảnh (JPG, PNG, WebP, GIF, AVIF)")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Kích thước file không được vượt quá 5MB")
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)

    try {
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result?.url) {
        throw new Error(result?.error || "Upload thất bại")
      }

      onChange({ url: result.url })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Không thể tải ảnh lên, vui lòng thử lại")
    } finally {
      setUploading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
  }

  const handleDropFile = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type.startsWith("image/")) {
      await uploadFile(file)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(e.clipboardData?.files || [])
    const imageFile = files.find((f) => f.type.startsWith("image/"))
    if (imageFile) {
      e.preventDefault()
      e.stopPropagation()
      await uploadFile(imageFile)
    }
  }

  const applyUrlDraft = () => {
    const trimmed = urlDraft.trim()
    if (trimmed) {
      onChange({ url: trimmed })
      setUrlDraft("")
    }
  }

  const alignClass = {
    left: "justify-start",
    center: "justify-center",
    right: "justify-end",
  }[align]

  const widthClass = width === "100%" ? "w-full" : width === "80%" ? "w-4/5" : "w-3/5"

  if (!url) {
    return (
      <div
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes("Files")) {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingOver(true)
          }
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDropFile}
        onPaste={handlePaste}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          isDraggingOver ? "border-brand-700 bg-brand-700/5" : "border-ink-300 bg-ink-100/10 hover:bg-ink-100/20"
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-brand-700/10 text-brand-700 flex items-center justify-center">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">
              {uploading ? "Đang tải hình ảnh lên..." : "Kéo thả ảnh vào đây, dán (Ctrl+V) hoặc chọn từ máy tính"}
            </p>
            <p className="text-xs text-ink-500">Hỗ trợ JPG, PNG, WebP, GIF (tối đa 5MB, khuyến nghị ≥ 1200px)</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? "Đang tải..." : "Chọn ảnh từ máy"}
            </Button>
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </div>

          <div className="flex items-center gap-2 w-full max-w-md mt-1">
            <Input
              placeholder="Hoặc dán URL hình ảnh (https://...) rồi nhấn Enter"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={applyUrlDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  applyUrlDraft()
                }
              }}
              disabled={uploading}
              className="h-8 text-xs"
            />
            {urlDraft.trim() && (
              <Button type="button" size="sm" className="h-8 text-xs" onClick={applyUrlDraft}>
                Chèn
              </Button>
            )}
          </div>

          {uploadError && <p className="text-xs text-red-600 font-medium mt-1">{uploadError}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${alignClass}`}>
      <figure className={widthClass}>
        <img
          src={url || "/placeholder.svg"}
          alt={alt || caption}
          width={width_px || undefined}
          height={height_px || undefined}
          className="w-full h-auto rounded-lg shadow-md"
        />

        {dimensions && dimensions.width < 1200 && (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Ảnh chỉ {dimensions.width}×{dimensions.height}px. Ảnh lớn (≥1200px ngang) đẹp hơn khi chia sẻ
              Facebook/Zalo và đủ điều kiện hiện thẻ lớn trên Google Discover.
            </span>
          </div>
        )}

        {/* Alt Text & Caption */}
        <div className="mt-3 grid sm:grid-cols-2 gap-3 rounded-lg border bg-ink-100/20 p-3">
          <div>
            <Label className="text-xs font-medium text-ink-900 flex items-center gap-1">
              Mô tả ảnh (Alt Text SEO) <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="VD: Quy trình đăng ký FDA cho thực phẩm..."
              value={alt}
              onChange={(e) => onChange({ alt: e.target.value })}
              className={`text-xs h-8 mt-1 ${!alt ? "border-amber-400 focus-visible:ring-amber-500" : "border-emerald-400"}`}
            />
            {!alt && <p className="text-[11px] text-amber-700 mt-1">Giúp Google hiểu nội dung ảnh và tăng điểm SEO</p>}
          </div>

          <div>
            <Label className="text-xs font-medium text-ink-500">Chú thích dưới ảnh (Tùy chọn)</Label>
            <Input
              placeholder="Chú thích hiển thị dưới hình..."
              value={caption}
              onChange={(e) => onChange({ caption: e.target.value })}
              className="text-xs h-8 mt-1 italic"
            />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-ink-500">Độ rộng:</Label>
            <select
              value={width}
              onChange={(e) => onChange({ width: e.target.value })}
              className="text-xs border rounded px-2 py-1 bg-white"
            >
              <option value="100%">Toàn bộ (100%)</option>
              <option value="80%">Lớn (80%)</option>
              <option value="60%">Vừa (60%)</option>
            </select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange({ url: "" })} className="text-xs h-7">
            Đổi ảnh khác
          </Button>
        </div>
      </figure>
    </div>
  )
}
