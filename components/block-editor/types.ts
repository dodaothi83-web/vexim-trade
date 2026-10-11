export type BlockType = "heading" | "paragraph" | "image" | "quote" | "table" | "list"

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
