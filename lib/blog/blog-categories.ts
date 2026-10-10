/**
 * Danh mục blog của veximtrade.com — nguồn dữ liệu duy nhất.
 *
 * Hiện chỉ có một mục: Tin tức. Các mục theo ngành hàng hay sản phẩm sẽ được thêm
 * vào đây khi doanh nghiệp mở rộng sang ngành khác; không hard-code danh mục ở nơi khác.
 */

export interface BlogCategory {
  /** Giá trị lưu trong cột `posts.category` và dùng trên URL */
  slug: string
  /** Nhãn hiển thị trong dropdown của trình soạn thảo và trên trang */
  label: string
  /** Tiêu đề trang danh mục (SEO) */
  title: string
  /** Mô tả trang danh mục (SEO) */
  description: string
  keywords: string[]
}

export const DEFAULT_BLOG_CATEGORY = "tin-tuc"

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: DEFAULT_BLOG_CATEGORY,
    label: "Tin tức",
    title: "Tin tức Veximtrade",
    description:
      "Tin tức và cập nhật từ Veximtrade về kết nối buyer quốc tế với nhà sản xuất Việt Nam.",
    keywords: ["tin tức Veximtrade", "sourcing Việt Nam", "buyer Mỹ"],
  },
]

export const BLOG_CATEGORY_SLUGS = BLOG_CATEGORIES.map((category) => category.slug)

export function getBlogCategory(slug: string): BlogCategory | undefined {
  return BLOG_CATEGORIES.find((category) => category.slug === slug)
}
