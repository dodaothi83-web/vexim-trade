import type { Category } from "@/lib/types";

/**
 * Chip "Popular searches" trên trang chủ.
 *
 * Đây là lối vào nhanh cho buyer, không phải danh sách danh mục. Vì vậy danh sách
 * KHÔNG được viết cứng: trước 21/10/2026 sáu chip trỏ vào /products/cashew, /coffee,
 * /pepper, /cinnamon, /coconut, /rice, nhưng trên production chỉ có dried-fruits,
 * spices và seafood-processed-fisheries-products được publish. Bấm chip nào cũng 404.
 *
 * Nay chip được dựng từ chính danh mục đang published (cùng nguồn với ô chọn danh mục
 * trong thanh tìm kiếm), nên không thể sinh ra liên kết chết. Bảng nhãn dưới đây chỉ
 * đổi cách gọi cho gọn theo kiểu thương mại (W320, ASTA, ST25), và chỉ có tác dụng khi
 * slug đó thật sự tồn tại.
 */

export interface PopularSearchLabel {
  en: string;
  vi: string;
}

export interface PopularSearchChip {
  label: string;
  href: string;
}

/** Nhãn thương mại cho những slug quen thuộc. Slug lạ vẫn có chip, dùng tên danh mục. */
export const POPULAR_SEARCH_LABELS: Record<string, PopularSearchLabel> = {
  cashew: { en: "Cashew W320", vi: "Hạt điều W320" },
  coffee: { en: "Robusta Coffee", vi: "Cà phê Robusta" },
  pepper: { en: "Black Pepper ASTA", vi: "Hồ tiêu đen ASTA" },
  spices: { en: "Dried spices", vi: "Gia vị khô" },
  "dried-spices": { en: "Dried spices", vi: "Gia vị khô" },
  cinnamon: { en: "Cassia Cinnamon", vi: "Quế ống Yên Bái" },
  coconut: { en: "Desiccated Coconut", vi: "Cơm dừa sấy khô" },
  rice: { en: "ST25 Fragrant Rice", vi: "Gạo thơm ST25" },
  seafood: { en: "Frozen seafood", vi: "Thủy hải sản đông lạnh" },
  "seafood-processed-fisheries-products": {
    en: "Seafood & processed fisheries",
    vi: "Thủy sản & thủy sản chế biến",
  },
  "dried-fruits": { en: "Dried fruits", vi: "Trái cây sấy" },
  "nuts-kernels": { en: "Nuts & kernels", vi: "Hạt dinh dưỡng" },
  macadamia: { en: "Macadamia", vi: "Hạt mắc ca" },
};

export const POPULAR_SEARCH_LIMIT = 6;

/**
 * Sinh danh sách chip từ các danh mục đã published.
 * `titleFor` là hàm lấy tên hiển thị của danh mục theo ngôn ngữ trang.
 */
export function buildPopularSearches(input: {
  categories: Pick<Category, "slug" | "name_i18n">[];
  lang: "en" | "vi";
  titleFor: (category: Pick<Category, "slug" | "name_i18n">) => string;
  limit?: number;
}): PopularSearchChip[] {
  const limit = input.limit ?? POPULAR_SEARCH_LIMIT;
  const bySlug = new Map(input.categories.map((c) => [c.slug, c]));
  const chips: PopularSearchChip[] = [];
  const used = new Set<string>();

  // 1. Nhãn thương mại, nhưng chỉ khi danh mục đó đang có thật.
  for (const [slug, label] of Object.entries(POPULAR_SEARCH_LABELS)) {
    if (chips.length >= limit) break;
    if (used.has(slug) || !bySlug.has(slug)) continue;
    chips.push({ label: label[input.lang], href: `/products/${encodeURIComponent(slug)}` });
    used.add(slug);
  }

  // 2. Danh mục mới thêm trong CRM vẫn có chip, dùng đúng tên đang hiển thị.
  for (const category of input.categories) {
    if (chips.length >= limit) break;
    if (used.has(category.slug)) continue;
    chips.push({
      label: input.titleFor(category),
      href: `/products/${encodeURIComponent(category.slug)}`,
    });
    used.add(category.slug);
  }
  return chips;
}
