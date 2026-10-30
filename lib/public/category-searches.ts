/**
 * Gợi ý tìm kiếm theo danh mục, dựng từ chính từ khoá nhà cung cấp đã khai.
 *
 * Vì sao không viết cứng: danh sách cứng sẽ lạc hậu ngay khi nhà cung cấp đổi
 * từ khoá, và có thể trỏ vào cụm từ không còn sản phẩm nào. Ở đây chỉ lấy từ
 * khoá đang có trên sản phẩm đã publish trong danh mục, nên chip nào cũng có
 * kết quả thật (hoặc rỗng thì không hiện chip).
 *
 * Module thuần, không import gì, để script kiểm tra nạp thẳng bằng node.
 */

export interface KeywordSuggestionSource {
  keywords?: readonly string[] | null;
}

export interface CategoryKeywordOptions {
  /** Tên danh mục đang hiển thị; từ khoá trùng tên danh mục thì bỏ để không lặp chip. */
  categoryName?: string;
  limit?: number;
}

export const CATEGORY_KEYWORD_LIMIT = 6;
const MIN_KEYWORD_LENGTH = 3;
const MAX_KEYWORD_LENGTH = 40;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Từ khoá đã nằm trong tên danh mục (theo cả từ) thì không cần gợi ý lại. */
function appearsInCategoryName(keyword: string, categoryName: string): boolean {
  const name = normalize(categoryName);
  if (!name) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(name);
}

/**
 * Danh sách cụm từ tìm kiếm cho một danh mục, xếp theo số sản phẩm dùng từ khoá đó.
 * Mỗi sản phẩm chỉ tính một lần cho một từ khoá; giữ nguyên chữ nhà cung cấp đã lưu.
 */
export function categoryKeywordSearches(
  products: readonly KeywordSuggestionSource[],
  options: CategoryKeywordOptions = {},
): string[] {
  const limit = options.limit ?? CATEGORY_KEYWORD_LIMIT;
  const categoryName = options.categoryName ?? "";
  const counts = new Map<string, { label: string; count: number; first: number }>();
  let order = 0;
  for (const product of products) {
    const seen = new Set<string>();
    for (const raw of product.keywords ?? []) {
      if (typeof raw !== "string") continue;
      const label = raw.trim().replace(/\s+/g, " ");
      if (!label) continue;
      const key = normalize(label);
      if (key.length < MIN_KEYWORD_LENGTH || key.length > MAX_KEYWORD_LENGTH) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      if (appearsInCategoryName(key, categoryName)) continue;
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { label, count: 1, first: order });
      order += 1;
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, limit)
    .map((entry) => entry.label);
}
