/**
 * Ô lọc "Danh mục" trên trang tìm kiếm.
 *
 * Chỉ liệt kê danh mục thật sự có sản phẩm khớp từ khoá (kèm số lượng), thay vì đổ
 * toàn bộ cây danh mục của sàn vào một ô chọn dài. Khi kết quả chỉ nằm trong một
 * danh mục thì không còn gì để lọc thêm: ẩn hẳn khối này.
 */
export type SearchCategoryFacet = {
  slug: string;
  name: string;
  /** Số sản phẩm khớp; null khi không đếm được (vd danh mục đang chọn nhưng không có sản phẩm nào). */
  count: number | null;
  selected: boolean;
};

export type SearchCategoryFacets = {
  /** Có hiện khối lọc danh mục hay không. */
  show: boolean;
  facets: SearchCategoryFacet[];
  /** Tổng số sản phẩm khớp trên mọi danh mục, cho lựa chọn "Tất cả danh mục"; null nếu không biết. */
  allCount: number | null;
};

type FacetCategory = { slug: string; sort_order?: number | null };

export function searchCategoryFacets<C extends FacetCategory>(input: {
  /** Sản phẩm khớp từ khoá, mỗi sản phẩm một lần, kèm danh mục công khai của nó. */
  matches: ReadonlyArray<{ category: C }>;
  /** true khi `matches` lấy trên toàn sàn (không bị giới hạn bởi danh mục đang chọn). */
  matchesAllCategories: boolean;
  selected: C | null;
  /** Số sản phẩm đang hiện trong danh mục đã chọn (gồm danh mục con). */
  selectedCount: number;
  name: (category: C) => string;
}): SearchCategoryFacets {
  const counted = new Map<string, { category: C; count: number }>();
  for (const { category } of input.matches) {
    const entry = counted.get(category.slug);
    if (entry) entry.count += 1;
    else counted.set(category.slug, { category, count: 1 });
  }
  const entries = [...counted.values()].sort((a, b) =>
    b.count - a.count ||
    (a.category.sort_order ?? 0) - (b.category.sort_order ?? 0) ||
    input.name(a.category).localeCompare(input.name(b.category)));
  const allCount = input.matchesAllCategories ? input.matches.length : null;
  // Kết quả chỉ thuộc một danh mục (hoặc không có): không còn gì để lọc thêm.
  if (entries.length < 2) return { show: false, facets: [], allCount };

  const selectedSlug = input.selected?.slug ?? null;
  const facets: SearchCategoryFacet[] = entries.map(({ category, count }) => ({
    slug: category.slug, name: input.name(category), count, selected: category.slug === selectedSlug,
  }));
  // Danh mục cha đang chọn không có sản phẩm trực tiếp: vẫn hiện ở đầu và được đánh dấu,
  // để người mua thấy mình đang lọc theo gì và bấm danh mục con để thu hẹp tiếp.
  if (input.selected && !facets.some((facet) => facet.selected)) {
    facets.unshift({
      slug: input.selected.slug, name: input.name(input.selected),
      count: input.selectedCount > 0 ? input.selectedCount : null, selected: true,
    });
  }
  return { show: true, facets, allCount };
}
