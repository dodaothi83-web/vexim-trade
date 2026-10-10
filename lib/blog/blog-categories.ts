/**
 * Cấu hình danh mục blog — nguồn dữ liệu duy nhất.
 *
 * Trước đây danh mục bị hard-code ở 5 nơi (trang tạo bài, trang sửa bài, trang blog,
 * trang danh mục và sitemap) nên rất dễ lệch nhau (ví dụ sitemap thiếu 2 danh mục).
 * Thêm danh mục mới chỉ cần sửa file này.
 */

export interface BlogCategory {
  /** Giá trị lưu trong cột `posts.category` và dùng trên URL */
  slug: string
  /** Nhãn hiển thị trong dropdown của trình soạn thảo */
  label: string
  /** Tiêu đề trang danh mục (SEO) */
  title: string
  /** Mô tả trang danh mục (SEO) */
  description: string
  keywords: string[]
  /** Trang dịch vụ liên quan (internal link) */
  relatedService?: string
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: "FDA",
    label: "FDA (Mỹ)",
    title: "Hướng dẫn đăng ký FDA",
    description:
      "Tin tức, hướng dẫn chi tiết về đăng ký FDA cho thực phẩm, dược phẩm và thiết bị y tế xuất khẩu sang Mỹ.",
    keywords: ["đăng ký FDA", "FDA Mỹ", "xuất khẩu thực phẩm Mỹ", "FDA registration"],
    relatedService: "/services/fda",
  },
  {
    slug: "GACC",
    label: "GACC (Trung Quốc)",
    title: "Hướng dẫn đăng ký GACC",
    description:
      "Cập nhật quy định GACC, hướng dẫn đăng ký xuất khẩu thực phẩm sang Trung Quốc theo Decree 248/249.",
    keywords: ["đăng ký GACC", "xuất khẩu Trung Quốc", "Decree 248", "Decree 249"],
    relatedService: "/services/gacc",
  },
  {
    slug: "MFDS",
    label: "MFDS (Hàn Quốc)",
    title: "Hướng dẫn đăng ký MFDS Hàn Quốc",
    description: "Quy định và thủ tục đăng ký MFDS cho thực phẩm, mỹ phẩm xuất khẩu sang Hàn Quốc.",
    keywords: ["đăng ký MFDS", "xuất khẩu Hàn Quốc", "MFDS Korea", "mỹ phẩm Hàn Quốc"],
    relatedService: "/services/mfds",
  },
  {
    slug: "Dịch vụ Agent Hoa Kỳ",
    label: "Dịch vụ Agent Hoa Kỳ",
    title: "Dịch vụ US Agent cho doanh nghiệp xuất khẩu",
    description:
      "Tìm hiểu về dịch vụ đại diện US Agent bắt buộc cho doanh nghiệp xuất khẩu thực phẩm, mỹ phẩm vào Hoa Kỳ.",
    keywords: ["US Agent", "đại diện FDA", "đại lý FDA Mỹ", "xuất khẩu Mỹ"],
    relatedService: "/services/us-agent",
  },
  {
    slug: "Truy xuất nguồn gốc",
    label: "Truy xuất nguồn gốc",
    title: "Truy xuất nguồn gốc sản phẩm",
    description: "Giải pháp truy xuất nguồn gốc bằng công nghệ AI và blockchain cho doanh nghiệp xuất khẩu.",
    keywords: ["truy xuất nguồn gốc", "blockchain", "AI traceability", "supply chain"],
    relatedService: "/services/ai-traceability",
  },
  {
    slug: "Ủy thác xuất nhập khẩu",
    label: "Ủy thác XNK",
    title: "Ủy thác xuất nhập khẩu",
    description: "Dịch vụ ủy thác xuất nhập khẩu trọn gói: khai báo hải quan, vận chuyển và thanh toán quốc tế.",
    keywords: ["ủy thác xuất nhập khẩu", "dịch vụ hải quan", "thủ tục XNK", "logistics"],
    relatedService: "/services/export-delegation",
  },
  {
    slug: "Tin tức thị trường",
    label: "Tin tức thị trường",
    title: "Tin tức thị trường xuất nhập khẩu",
    description: "Cập nhật tin tức mới nhất về thị trường xuất nhập khẩu quốc tế và chính sách thương mại.",
    keywords: ["tin tức xuất nhập khẩu", "thị trường quốc tế", "chính sách thương mại"],
  },
  {
    slug: "Xuất nhập khẩu",
    label: "Xuất nhập khẩu",
    title: "Kiến thức xuất nhập khẩu",
    description: "Hướng dẫn chi tiết về quy trình xuất nhập khẩu, thủ tục hải quan và logistics quốc tế.",
    keywords: ["xuất nhập khẩu", "thủ tục hải quan", "logistics", "vận chuyển quốc tế"],
    relatedService: "/services/export-delegation",
  },
  {
    slug: "Kiến thức pháp lý",
    label: "Kiến thức pháp lý",
    title: "Kiến thức pháp lý xuất nhập khẩu",
    description: "Cập nhật quy định pháp lý, hiệp định thương mại và các yêu cầu tuân thủ trong xuất nhập khẩu.",
    keywords: ["pháp lý xuất nhập khẩu", "hiệp định thương mại", "tuân thủ pháp luật"],
  },
]

export const BLOG_CATEGORY_SLUGS = BLOG_CATEGORIES.map((category) => category.slug)

export function getBlogCategory(slug: string): BlogCategory | undefined {
  if (!slug) return undefined
  return BLOG_CATEGORIES.find((category) => category.slug === slug)
}
