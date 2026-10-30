"use client";

import { useMemo } from "react";

import { sanitizeProductDescriptionInBrowser } from "./product-description-browser";

/** Read-only preview for CMS review screens, including unsaved editor content. */
export function ProductDescriptionPreview({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  const html = useMemo(() => sanitizeProductDescriptionInBrowser(value), [value]);
  if (!html) return <span className="text-ink-400">Chưa có mô tả chi tiết.</span>;
  return <div className={`product-description ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
