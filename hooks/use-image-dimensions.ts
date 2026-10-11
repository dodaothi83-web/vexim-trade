"use client"

import { useEffect, useState } from "react"

export interface ImageDimensions {
  width: number
  height: number
}

/**
 * Đo kích thước thật của ảnh từ URL.
 *
 * Dùng để cảnh báo ảnh bìa chưa đạt chuẩn Google Discover (≥1200px ngang, >300.000 pixel)
 * và để lưu width/height vào block ảnh (giúp trình duyệt chừa chỗ trước -> giảm CLS).
 */
export function useImageDimensions(url: string | null | undefined): ImageDimensions | null {
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null)

  useEffect(() => {
    if (!url || typeof window === "undefined" || !window.Image) {
      setDimensions(null)
      return
    }

    let cancelled = false
    try {
      const image = new window.Image()

      image.onload = () => {
        if (!cancelled) setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
      }
      image.onerror = () => {
        if (!cancelled) setDimensions(null)
      }
      image.src = url

      return () => {
        cancelled = true
        image.onload = null
        image.onerror = null
      }
    } catch {
      setDimensions(null)
    }
  }, [url])

  return dimensions
}

/** Điều kiện ảnh lớn cho Google Discover: ≥1200px ngang và >300.000 pixel tổng. */
export function isDiscoverReady(dimensions: ImageDimensions | null): boolean {
  if (!dimensions) return false
  return dimensions.width >= 1200 && dimensions.width * dimensions.height > 300000
}
