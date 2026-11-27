export type BlockType = "heading" | "paragraph" | "image" | "quote" | "table" | "list" | "video" | "callout"

/** Khối chỉ dùng trong bài hướng dẫn nhà cung cấp; blog bỏ qua (xem lib/blog/post-payload.ts). */
export type ExtraBlockType = "video" | "callout"

export type AlignType = "left" | "center" | "right" | "justify"

export interface Block {
  id: string
  type: BlockType
  data: any
}

export interface HeadingData {
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  align: "left" | "center" | "right"
}

export interface ParagraphData {
  text: string
  align: AlignType
}

export interface ImageData {
  url: string
  alt: string
  caption: string
  align: "left" | "center" | "right"
  width: string
  /** Kích thước thật của ảnh — render thành width/height để chống nhảy layout (CLS) */
  width_px?: number
  height_px?: number
}

export interface QuoteData {
  text: string
  author?: string
  align: "left" | "center"
}

export interface TableData {
  rows: number
  cols: number
  content: string[][]
  hasHeader: boolean
  align: "left" | "center" | "right"
}

export interface ListData {
  style: "ordered" | "unordered"
  items: string[]
  align: AlignType
}

/** Video YouTube (chỉ bài hướng dẫn) */
export interface VideoData {
  url: string
  caption: string
}

export type CalloutTone = "note" | "tip" | "warning"

/** Hộp Lưu ý / Mẹo / Cảnh báo (chỉ bài hướng dẫn); chữ thuần, không định dạng */
export interface CalloutData {
  tone: CalloutTone
  text: string
}
