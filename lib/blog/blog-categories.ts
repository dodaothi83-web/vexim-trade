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
  /** Ngôn ngữ của mục: quyết định <html lang>, định dạng ngày và câu chữ trên trang. */
  lang: "en" | "vi"
  /** Đường dẫn danh sách bài của mục; bài nằm ở `${basePath}/<slug>`. */
  basePath: string
  /** Mục có được gửi trong thư tuần cho người mua không (chỉ mục tiếng Anh dành cho người mua). */
  inBuyerDigest: boolean
}

export const DEFAULT_BLOG_CATEGORY = "tin-tuc"

/**
 * Mục tiếng Việt cho doanh nghiệp Việt Nam (SEO thu hút nhà cung cấp, chủ dự án duyệt 27/11/2026).
 * Bài viết riêng cho người đọc Việt, không phải bản dịch của mục Tin tức; không vào thư người mua.
 */
export const VI_EXPORT_BLOG_CATEGORY = "xuat-khau"

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: DEFAULT_BLOG_CATEGORY,
    label: "News",
    title: "News",
    description:
      "News and updates from Vexim Trade on connecting international buyers with Vietnamese food producers.",
    keywords: ["Vexim Trade news", "Vietnam food sourcing", "US buyers"],
    lang: "en",
    basePath: "/blog",
    inBuyerDigest: true,
  },
  {
    slug: VI_EXPORT_BLOG_CATEGORY,
    label: "Kiến thức xuất khẩu (tiếng Việt)",
    title: "Kiến thức xuất khẩu nông sản và thực phẩm",
    description:
      "Hướng dẫn xuất khẩu nông sản, thực phẩm Việt Nam: thủ tục, chứng nhận, tìm khách hàng quốc tế và bán hàng trên Vexim Trade.",
    keywords: ["xuất khẩu nông sản", "tìm khách hàng nước ngoài", "chứng nhận xuất khẩu", "Vexim Trade"],
    lang: "vi",
    basePath: "/blog/xuat-khau",
    inBuyerDigest: false,
  },
]

export const BLOG_CATEGORY_SLUGS = BLOG_CATEGORIES.map((category) => category.slug)

export function getBlogCategory(slug: string): BlogCategory | undefined {
  return BLOG_CATEGORIES.find((category) => category.slug === slug)
}

/** Đường dẫn công khai của một bài theo mục; mục không rõ thì dùng mục Tin tức. */
export function blogPostPath(post: { slug: string; category: string }): string {
  const base = getBlogCategory(post.category)?.basePath ?? "/blog"
  return `${base}/${encodeURIComponent(post.slug)}`
}

/** Các mục được gửi trong thư tuần cho người mua. */
export const BUYER_DIGEST_BLOG_CATEGORIES = BLOG_CATEGORIES.filter((category) => category.inBuyerDigest).map((category) => category.slug)
